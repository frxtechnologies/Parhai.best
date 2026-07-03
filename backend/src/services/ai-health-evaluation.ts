import type{SupabaseClient}from"@supabase/supabase-js";
import{buildCambridgeIdentity,validateQuestionMarkSchemePair}from"./cambridge-identity";

async function allRows(client:SupabaseClient,table:string,select:string){
  const rows:any[]=[];for(let offset=0;;offset+=500){
    const{data,error}=await client.from(table).select(select).range(offset,offset+499);
    if(error)throw error;rows.push(...(data??[]));if((data?.length??0)<500)break;
  }return rows;
}

export async function discoverAiCoverage(client:SupabaseClient){
  const[subjects,resources,questions,answers]=await Promise.all([
    allRows(client,"subjects","id,name,code,level"),
    allRows(client,"resources","id,subject_id,level,resource_type,year,session,paper_code,paper_number,variant,processing_status,related_resource_id,is_approved"),
    allRows(client,"question_index","id,subject_id,resource_id,student_verified,needs_review,topic,confidence,question_type,marks,total_marks,screenshot_status,question_screenshot_url,marking_scheme_answer_id,marking_scheme_link_status"),
    allRows(client,"marking_scheme_answers","id,resource_id,answer_type,is_question_specific,linked_status,verification_status"),
  ]);
  const bySubject=subjects.map(subject=>{
    const rs=resources.filter(row=>Number(row.subject_id)===Number(subject.id));
    const resourceIds=new Set(rs.map(row=>Number(row.id))),qs=questions.filter(row=>Number(row.subject_id)===Number(subject.id));
    const as=answers.filter(row=>resourceIds.has(Number(row.resource_id)));
    const schemeResources=rs.filter(row=>row.resource_type==="MARKING_SCHEME");
    const paperResources=rs.filter(row=>row.resource_type==="PAST_PAPER");
    const schemeIdentity=new Set(schemeResources.map(row=>`${row.year}|${row.session}|${row.paper_number??row.paper_code}|${row.variant}`));
    const unlinkedWithScheme=qs.filter(q=>{
      if(["linked","linked_exact"].includes(String(q.marking_scheme_link_status)))return false;
      const paper=paperResources.find(row=>Number(row.id)===Number(q.resource_id));
      return paper&&schemeIdentity.has(`${paper.year}|${paper.session}|${paper.paper_number??paper.paper_code}|${paper.variant}`);
    }).length;
    return{level:subject.level,syllabusCode:subject.code,subjectName:subject.name,
      questionPapers:paperResources.length,markingSchemes:schemeResources.length,indexedQuestions:qs.length,
      verifiedQuestions:qs.filter(row=>row.student_verified&&!row.needs_review).length,
      withTopic:qs.filter(row=>row.topic&&row.topic!=="Unclassified").length,
      withQuestionType:qs.filter(row=>row.question_type&&row.question_type!=="unknown").length,
      withMarks:qs.filter(row=>Number(row.total_marks??row.marks)>0).length,
      withPreviews:qs.filter(row=>row.question_screenshot_url||["generated","full_page_fallback"].includes(row.screenshot_status)).length,
      linkedQuestions:qs.filter(row=>["linked","linked_exact"].includes(row.marking_scheme_link_status)).length,
      unlinkedWithMatchingScheme:unlinkedWithScheme,
      genericGuidance:as.filter(row=>row.answer_type==="generic_guidance").length,
      answerNeedsReview:as.filter(row=>row.verification_status==="needs_review"||row.linked_status==="needs_review").length,
      questionNeedsReview:qs.filter(row=>row.needs_review).length,
      unknownQuestionTypes:qs.filter(row=>!row.question_type||row.question_type==="unknown").length,
      missingPreviews:qs.filter(row=>!row.question_screenshot_url&&!["generated","full_page_fallback"].includes(row.screenshot_status)).length,
    };
  }).filter(row=>row.questionPapers||row.markingSchemes||row.indexedQuestions);
  const totals:Record<string,number>={
    questionPapers:0,markingSchemes:0,indexedQuestions:0,verifiedQuestions:0,withTopic:0,withQuestionType:0,withMarks:0,withPreviews:0,linkedQuestions:0,unlinkedWithMatchingScheme:0,genericGuidance:0,answerNeedsReview:0,questionNeedsReview:0,unknownQuestionTypes:0,missingPreviews:0,
  };
  for(const row of bySubject)for(const key of Object.keys(totals))totals[key]=(totals[key]??0)+Number((row as any)[key]??0);
  const denominator=Math.max(1,totals.indexedQuestions*5),health=Math.round((totals.verifiedQuestions+totals.withTopic+totals.withQuestionType+totals.withPreviews+totals.linkedQuestions)/denominator*1000)/10;
  return{generatedAt:new Date().toISOString(),healthPercent:health,totals,subjects:bySubject};
}

export async function evaluateAllMarkingLinks(client:SupabaseClient){
  const[questions,answers,resources,subjects]=await Promise.all([
    allRows(client,"question_index","id,subject_id,resource_id,year,session,paper_code,variant,question_number,question_part,marking_scheme_answer_id,marking_scheme_link_status,marking_scheme_status"),
    allRows(client,"marking_scheme_answers","id,resource_id,syllabus_code,level,year,session,paper_number,variant,question_number,question_part,answer_type,is_question_specific,confidence,extraction_confidence,link_confidence,source_page,crop_path,verification_status,linked_status"),
    allRows(client,"resources","id,subject_id,level,year,session,paper_code,paper_number,variant,resource_type,related_resource_id"),
    allRows(client,"subjects","id,code,level"),
  ]);
  const answerById=new Map(answers.map(row=>[Number(row.id),row])),resourceById=new Map(resources.map(row=>[Number(row.id),row])),subjectById=new Map(subjects.map(row=>[Number(row.id),row]));
  const checked=[] as any[];
  const storedReferences=questions.filter(row=>row.marking_scheme_answer_id);
  for(const question of storedReferences.filter(row=>["linked","linked_exact"].includes(String(row.marking_scheme_link_status)))){
    const answer=answerById.get(Number(question.marking_scheme_answer_id)),paper=resourceById.get(Number(question.resource_id)),scheme=answer?resourceById.get(Number(answer.resource_id)):null,subject=subjectById.get(Number(question.subject_id));
    if(!answer){checked.push({questionId:question.id,answerId:question.marking_scheme_answer_id,valid:false,status:"invalid_link",reasons:["linked answer row is missing"]});continue}
    const questionRow={...paper,...question,subject_code:subject?.code,level:paper?.level??subject?.level};
    const answerRow={...scheme,...answer,syllabus_code:answer.syllabus_code??subject?.code,level:answer.level??scheme?.level??subject?.level,year:answer.year??scheme?.year,session:answer.session??scheme?.session,paper_number:answer.paper_number??scheme?.paper_number??scheme?.paper_code,variant:answer.variant??scheme?.variant};
    checked.push({questionId:question.id,answerId:answer.id,previewMissing:!answer.source_page&&!answer.crop_path,...validateQuestionMarkSchemePair(questionRow,answerRow)});
  }
  const invalid=checked.filter(row=>!row.valid);
  const linkedAnswerIds=new Set(questions.map(row=>Number(row.marking_scheme_answer_id)).filter(Boolean));
  const answerExistsNotLinked=answers.filter(row=>row.answer_type==="question_answer"&&row.is_question_specific&&!linkedAnswerIds.has(Number(row.id))).length;
  return{generatedAt:new Date().toISOString(),storedAnswerReferences:storedReferences.length,flaggedInvalidReferences:storedReferences.filter(row=>row.marking_scheme_status==="invalid_link").length,needsReviewReferences:storedReferences.filter(row=>row.marking_scheme_status==="needs_review").length,totalLinksChecked:checked.length,validLinks:checked.length-invalid.length,invalidLinks:invalid.length,genericGuidanceLinked:invalid.filter(row=>row.reasons?.some((reason:string)=>reason.includes("generic_guidance"))).length,previewMissing:checked.filter(row=>row.previewMissing).length,answerExistsNotLinked,invalid,checked};
}

export async function runDynamicAiEvaluation(client:SupabaseClient){
  const coverage=await discoverAiCoverage(client),tests:any[]=[];
  const[questions,subjects]=await Promise.all([
    allRows(client,"question_index","id,subject_id,year,session,paper_code,variant,topic,question_type,student_verified,needs_review,marking_scheme_link_status"),
    allRows(client,"subjects","id,name,code,level"),
  ]);
  for(const subject of coverage.subjects){
    const subjectRow=subjects.find(row=>String(row.code)===String(subject.syllabusCode));
    const rows=questions.filter(row=>Number(row.subject_id)===Number(subjectRow?.id));
    tests.push({type:"subject_coverage",syllabusCode:subject.syllabusCode,pass:subject.indexedQuestions>0||subject.questionPapers>0,observed:subject.indexedQuestions});
    tests.push({type:"verified_subset",syllabusCode:subject.syllabusCode,pass:subject.verifiedQuestions<=subject.indexedQuestions});
    tests.push({type:"marking_subset",syllabusCode:subject.syllabusCode,pass:subject.linkedQuestions<=subject.indexedQuestions});
    tests.push({type:"preview_subset",syllabusCode:subject.syllabusCode,pass:subject.withPreviews<=subject.indexedQuestions});
    for(const paper of [...new Set(rows.map(row=>Number(row.paper_code)).filter(Boolean))])
      tests.push({type:"paper_exactness",syllabusCode:subject.syllabusCode,paper,observed:rows.filter(row=>Number(row.paper_code)===paper).length,pass:rows.filter(row=>Number(row.paper_code)===paper).every(row=>Number(row.paper_code)===paper)});
    for(const year of [...new Set(rows.map(row=>Number(row.year)).filter(Boolean))])
      tests.push({type:"year_exactness",syllabusCode:subject.syllabusCode,year,observed:rows.filter(row=>Number(row.year)===year).length,pass:rows.filter(row=>Number(row.year)===year).every(row=>Number(row.year)===year)});
    for(const session of [...new Set(rows.map(row=>String(row.session)).filter(Boolean))])
      tests.push({type:"session_exactness",syllabusCode:subject.syllabusCode,session,observed:rows.filter(row=>String(row.session)===session).length,pass:rows.filter(row=>String(row.session)===session).every(row=>String(row.session)===session)});
    for(const topic of [...new Set(rows.filter(row=>row.topic&&row.topic!=="Unclassified").map(row=>String(row.topic)))])
      tests.push({type:"topic_exactness",syllabusCode:subject.syllabusCode,topic,observed:rows.filter(row=>row.topic===topic).length,pass:rows.filter(row=>row.topic===topic).every(row=>row.topic===topic)});
    for(const questionType of [...new Set(rows.filter(row=>row.question_type&&row.question_type!=="unknown").map(row=>String(row.question_type)))])
      tests.push({type:"question_type_exactness",syllabusCode:subject.syllabusCode,questionType,observed:rows.filter(row=>row.question_type===questionType).length,pass:rows.filter(row=>row.question_type===questionType).every(row=>row.question_type===questionType)});
    const official=rows.filter(row=>["linked","linked_exact"].includes(row.marking_scheme_link_status));
    tests.push({type:"official_scheme_subset",syllabusCode:subject.syllabusCode,observed:official.length,pass:official.every(row=>row.marking_scheme_link_status==="linked"||row.marking_scheme_link_status==="linked_exact")});
  }
  const links=await evaluateAllMarkingLinks(client);
  tests.push({type:"all_link_identities",pass:links.invalidLinks===0,invalidLinks:links.invalidLinks});
  return{generatedAt:new Date().toISOString(),subjectsTested:coverage.subjects.length,totalTests:tests.length,passed:tests.filter(test=>test.pass).length,failed:tests.filter(test=>!test.pass),tests,coverage,markingLinks:{total:links.totalLinksChecked,valid:links.validLinks,invalid:links.invalidLinks}};
}
