import type { SupabaseClient } from "@supabase/supabase-js";
import { detectRequestedTopic } from "./rag-utils";

export type ExamFilters = {
  subjectCode?: string;
  subjectId?: number;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  session?: string;
  paperNumber?: number;
  variant?: number;
  topic?: string;
  subtopic?: string;
  difficulty?: "EASY"|"MEDIUM"|"HARD";
  markingSchemeOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type ExamIntent = "paper_lookup"|"question_search"|"topic_count"|"paper_analysis"|"topic_trend"|"repeated_questions"|"marking_scheme_lookup"|"question_explanation"|"load_more"|"general_teaching_answer";

export function detectSubjectCode(message:string):"4024"|"5054"|null {
  if (/\b(?:maths?|mathematics(?:\s+syllabus\s+d)?|4024)\b/i.test(message)) return "4024";
  if (/\b(?:physics|phy|5054)\b/i.test(message)) return "5054";
  return null;
}

export function detectExamIntent(message:string):ExamIntent {
  if(/\bhow many\b/i.test(message)) return "topic_count";
  if(/\b(analy[sz]e|topic breakdown|each topic|in this paper|in .*paper)\b/i.test(message)) return "paper_analysis";
  if(/\b(increasing|decreasing|trend|over the years?|recent papers?)\b/i.test(message)) return "topic_trend";
  if(/\b(repeated|similar patterns?|comes? up often)\b/i.test(message)) return "repeated_questions";
  if(/\b(marking scheme|mark scheme|marking points?)\b/i.test(message)&&/\b(show|explain|logic|for q|question)\b/i.test(message)) return "marking_scheme_lookup";
  if(/\b(explain|teach|why|how)\b/i.test(message)&&/\b(q(?:uestion)?\s*\d+|this question)\b/i.test(message)) return "question_explanation";
  if(/\b(give|show|find|open)\b.*\b(?:paper|qp|ms|mark scheme)\b/i.test(message) && !/\bquestions?\b/i.test(message)) return "paper_lookup";
  if(/\b(questions?|worksheet|practice)\b/i.test(message)) return "question_search";
  return "general_teaching_answer";
}

function boundedPage(filters:ExamFilters) {
  return {limit:Math.min(Math.max(filters.limit??10,1),50),offset:Math.max(filters.offset??0,0)};
}

async function subjectId(client:SupabaseClient,filters:ExamFilters) {
  if(filters.subjectId) return filters.subjectId;
  if(!filters.subjectCode) return null;
  const {data,error}=await client.from("subjects").select("id").eq("code",filters.subjectCode).maybeSingle();
  if(error) throw error;
  return data?.id?Number(data.id):null;
}

export function createExamEngine(client:SupabaseClient) {
  async function findPapers(filters:ExamFilters) {
    const sid=await subjectId(client,filters);
    let query=client.from("resources")
      .select("id,subject_id,title,original_filename,resource_type,year,session,paper_code,paper_number,variant,bucket,storage_path,related_resource_id,processing_status,subjects(name,code),question_index(count)",{count:"exact"})
      .in("resource_type",["PAST_PAPER","MARKING_SCHEME","GRADE_THRESHOLD","EXAMINER_REPORT"])
      .eq("is_approved",true);
    if(sid) query=query.eq("subject_id",sid);
    if(filters.year) query=query.eq("year",filters.year);
    if(filters.session) query=query.eq("session",filters.session);
    if(filters.paperNumber) query=query.eq("paper_code",String(filters.paperNumber));
    if(filters.variant) query=query.eq("variant",filters.variant);
    const {limit,offset}=boundedPage(filters);
    const {data,error,count}=await query.order("year",{ascending:false}).range(offset,offset+limit-1);
    if(error) throw error;
    return {rows:data??[],total:count??0,limit,offset};
  }

  async function findQuestions(filters:ExamFilters) {
    const sid=await subjectId(client,filters);
    let query=client.from("question_index")
      .select("id,resource_id,subject_id,question_number,question_part,display_question_text,clean_question_text,topic,subtopic,difficulty,marks,total_marks,year,session,paper_code,variant,source_page,bbox,screenshot_status,question_screenshot_url,answer_text,marking_scheme_answer_id,marking_scheme_link_status,marking_scheme_answers(resource_id,source_page,marks),resources!inner(id,bucket,storage_path,is_approved),subjects(name,code)",{count:"exact"})
      .eq("student_verified",true).eq("needs_review",false).eq("resources.is_approved",true).not("clean_question_text","is",null);
    if(sid) query=query.eq("subject_id",sid);
    if(filters.year) query=query.eq("year",filters.year);
    if(filters.yearFrom) query=query.gte("year",filters.yearFrom);
    if(filters.yearTo) query=query.lte("year",filters.yearTo);
    if(filters.session) query=query.eq("session",filters.session);
    if(filters.paperNumber) query=query.eq("paper_code",String(filters.paperNumber));
    if(filters.variant) query=query.eq("variant",filters.variant);
    if(filters.topic) query=query.ilike("topic",filters.topic);
    if(filters.subtopic) query=query.ilike("subtopic",`%${filters.subtopic}%`);
    if(filters.difficulty) query=query.eq("difficulty",filters.difficulty);
    if(filters.markingSchemeOnly) query=query.in("marking_scheme_link_status",["linked","partial","linked_exact","linked_partial"]);
    const {limit,offset}=boundedPage(filters);
    const {data,error,count}=await query.order("year",{ascending:false}).order("confidence",{ascending:false}).order("id",{ascending:true}).range(offset,offset+limit-1);
    if(error) throw error;
    return {rows:data??[],total:count??0,limit,offset,hasMore:offset+limit<(count??0)};
  }

  async function findQuestionsByTopic(subjectCode:string,topic:string,filters:ExamFilters={}) {
    const detected=detectRequestedTopic(topic,subjectCode);
    return findQuestions({...filters,subjectCode,topic:detected?.topic??topic});
  }

  async function getPaperQuestions(subjectCode:string,year:number,session:string,paperNumber:number,variant:number) {
    return findQuestions({subjectCode,year,session,paperNumber,variant,limit:50});
  }

  async function getQuestionWithSources(questionId:number) {
    const {data,error}=await client.from("question_index")
      .select("*,resources(id,title,bucket,storage_path,original_filename,related_resource_id),subjects(name,code),question_images(*),marking_scheme_answers(resource_id,source_page)")
      .eq("id",questionId).eq("student_verified",true).eq("needs_review",false).single();
    if(error) throw error;
    return data;
  }

  async function getLinkedMarkingScheme(questionId:number) {
    const {data,error}=await client.from("question_index")
      .select("id,answer_text,marking_scheme_answer_id,marking_scheme_link_status,marking_scheme_answers(*)")
      .eq("id",questionId).single();
    if(error) throw error;
    return ["linked","partial","linked_exact","linked_partial"].includes(data.marking_scheme_link_status)?data:null;
  }

  async function getQuestionScreenshot(questionId:number) {
    const {data,error}=await client.from("question_index")
      .select("id,resource_id,source_page,bbox,screenshot_status,question_screenshot_url,question_screenshot_path,question_images(*)")
      .eq("id",questionId).single();
    if(error) throw error;
    return data;
  }

  async function getMarkingSchemeScreenshot(questionId:number) {
    const linked=await getLinkedMarkingScheme(questionId);
    if(!linked?.marking_scheme_answer_id) return null;
    const {data,error}=await client.from("marking_scheme_answers").select("*").eq("id",linked.marking_scheme_answer_id).single();
    if(error) throw error;
    return data;
  }

  async function getTopicCountsForPaper(filters:Required<Pick<ExamFilters,"subjectCode"|"year"|"session"|"paperNumber"|"variant">>) {
    const {rows}=await getPaperQuestions(filters.subjectCode,filters.year,filters.session,filters.paperNumber,filters.variant);
    const sid=await subjectId(client,filters);
    let allQuery=client.from("question_index").select("id,marks,total_marks,screenshot_status,question_screenshot_url,marking_scheme_link_status,marking_scheme_answers(marks)")
      .eq("subject_id",sid!).eq("year",filters.year).eq("session",filters.session)
      .eq("paper_code",String(filters.paperNumber)).eq("variant",filters.variant);
    const {data:allRows,error}=await allQuery;
    if(error) throw error;
    const aggregate=aggregateTopics(rows);
    const linkedAnswer=(row:any)=>Array.isArray(row.marking_scheme_answers)?row.marking_scheme_answers[0]:row.marking_scheme_answers;
    const rowMarks=(row:any)=>Number(row.total_marks??row.marks??linkedAnswer(row)?.marks??0);
    const totalMarks=rows.reduce((sum,row)=>sum+rowMarks(row),0);
    const indexedMarks=(allRows??[]).reduce((sum,row)=>sum+rowMarks(row),0);
    const linkedStatuses=new Set(["linked","partial","linked_exact","linked_partial"]);
    const difficulty={EASY:{questions:0,marks:0},MEDIUM:{questions:0,marks:0},HARD:{questions:0,marks:0},UNCLASSIFIED:{questions:0,marks:0}};
    let linked=0,screenshots=0;
    for(const row of rows){
      const key=(["EASY","MEDIUM","HARD"].includes(String(row.difficulty))?row.difficulty:"UNCLASSIFIED") as keyof typeof difficulty;
      difficulty[key].questions+=1;difficulty[key].marks+=rowMarks(row);
      if(linkedStatuses.has(String(row.marking_scheme_link_status)))linked+=1;
      if(["generated","full_page_fallback"].includes(String(row.screenshot_status))||row.question_screenshot_url)screenshots+=1;
    }
    const fullLinked=(allRows??[]).filter(row=>linkedStatuses.has(String(row.marking_scheme_link_status))).length;
    const fullScreenshots=(allRows??[]).filter(row=>["generated","full_page_fallback"].includes(String(row.screenshot_status))||row.question_screenshot_url).length;
    const topics=aggregate.topics.map(topic=>{
      const topicRows=rows.filter(row=>String(row.topic||"Unclassified")===topic.topic);
      const linkedCount=topicRows.filter(row=>linkedStatuses.has(String(row.marking_scheme_link_status))).length;
      const hard=topicRows.filter(row=>row.difficulty==="HARD").length,medium=topicRows.filter(row=>row.difficulty==="MEDIUM").length;
      return {...topic,percentageOfMarks:totalMarks?Math.round(topic.marks/totalMarks*1000)/10:0,averageDifficulty:hard>medium?"Hard":medium?"Medium":"Easy",markingSchemeLinked:linkedCount};
    });
    const highValueTopics=topics.slice().sort((a,b)=>(b.marks+b.questions*2+(b.difficulty.HARD??0)*3)-(a.marks+a.questions*2+(a.difficulty.HARD??0)*3)).map((topic,index)=>({topic:topic.topic,priority:index<3?"HIGH":"NORMAL",reason:`${topic.marks} marks, ${topic.questions} questions, ${topic.difficulty.HARD??0} hard.`}));
    return {
      overview:{...filters,totalIndexedQuestions:(allRows??[]).length,verifiedQuestions:rows.length,totalMarks:indexedMarks||totalMarks,verifiedMarks:totalMarks,markingSchemeLinked:fullLinked,markingSchemeMissing:(allRows??[]).length-fullLinked,screenshotsAvailable:fullScreenshots,verifiedScreenshotsAvailable:screenshots,completeness:(allRows??[]).length===rows.length?"complete":"partial"},
      topics,difficulty,questions:rows,highValueTopics,
      revisionRecommendation:highValueTopics.slice(0,3).map(item=>`${item.topic}: ${item.reason}`),
    };
  }

  async function getTopicCountsForYearRange(filters:ExamFilters) {
    const {rows,total}=await allQuestions(filters);
    return {total,...aggregateTopics(rows)};
  }

  async function getTopicTrend(filters:ExamFilters) {
    const {rows}=await allQuestions(filters);
    const byYear=new Map<number,{questions:number;marks:number}>();
    for(const row of rows) {
      const year=Number(row.year); if(!year) continue;
      const value=byYear.get(year)??{questions:0,marks:0};
      value.questions+=1; value.marks+=Number(row.total_marks??row.marks??0); byYear.set(year,value);
    }
    return [...byYear.entries()].sort((a,b)=>a[0]-b[0]).map(([year,value])=>({year,...value}));
  }

  async function getRepeatedQuestionPatterns(filters:ExamFilters) {
    const {rows}=await allQuestions(filters);
    const groups=new Map<string,typeof rows>();
    for(const row of rows) {
      const key=String(row.clean_question_text??"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").slice(0,12).join(" ");
      if(key.length<20) continue; const group=groups.get(key)??[]; group.push(row); groups.set(key,group);
    }
    return [...groups.entries()].filter(([,group])=>group.length>1).map(([pattern,questions])=>({pattern,count:questions.length,questions}));
  }

  async function getStudentWeakTopics(userId:string) {
    const {data,error}=await client.from("student_topic_progress").select("*").eq("user_id",userId).order("mastery_score",{ascending:true}).limit(10);
    if(error) throw error; return data??[];
  }

  async function allQuestions(filters:ExamFilters) {
    const rows:any[]=[]; let offset=0; let total=0;
    do {
      const page=await findQuestions({...filters,limit:50,offset});
      rows.push(...page.rows); total=page.total; offset+=page.limit;
    } while(offset<total&&offset<2000);
    return {rows,total};
  }

  async function getStudentProgressMemory(userId:string) {
    const [profile,topics,recent,mistakes]=await Promise.all([
      client.from("student_learning_profile").select("*").eq("user_id",userId).maybeSingle(),
      client.from("student_topic_progress").select("*").eq("user_id",userId).order("updated_at",{ascending:false}),
      client.from("student_question_activity").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(50),
      client.from("student_mistake_history").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(50),
    ]);
    for(const result of [profile,topics,recent,mistakes]) if(result.error) throw result.error;
    return {profile:profile.data,topics:topics.data??[],recentActivity:recent.data??[],mistakes:mistakes.data??[]};
  }

  return {findPapers,findQuestions,findQuestionsByTopic,getPaperQuestions,getQuestionWithSources,getLinkedMarkingScheme,getQuestionScreenshot,getMarkingSchemeScreenshot,getTopicCountsForPaper,getTopicCountsForYearRange,getTopicTrend,getRepeatedQuestionPatterns,getStudentWeakTopics,getStudentProgressMemory};
}

export function aggregateTopics(rows:Array<Record<string,any>>) {
  const topics=new Map<string,{questions:number;marks:number;subtopics:Record<string,number>;difficulty:Record<string,number>;questionIds:number[]}>();
  for(const row of rows) {
    const topic=String(row.topic||"Unclassified"),value=topics.get(topic)??{questions:0,marks:0,subtopics:{},difficulty:{},questionIds:[]};
    const answer=Array.isArray(row.marking_scheme_answers)?row.marking_scheme_answers[0]:row.marking_scheme_answers;
    value.questions+=1; value.marks+=Number(row.total_marks??row.marks??answer?.marks??0); value.questionIds.push(Number(row.id));
    if(row.subtopic) value.subtopics[row.subtopic]=(value.subtopics[row.subtopic]??0)+1;
    if(row.difficulty) value.difficulty[row.difficulty]=(value.difficulty[row.difficulty]??0)+1;
    topics.set(topic,value);
  }
  return {topics:[...topics.entries()].map(([topic,value])=>({topic,...value})).sort((a,b)=>b.questions-a.questions)};
}

export function inferDifficulty(input:{marks?:number|null;questionNumber?:string|null;text?:string|null;schemePoints?:number}) {
  const marks=Number(input.marks??0),text=String(input.text??"");
  const multipart=(String(input.questionNumber??"").match(/\(/g)??[]).length;
  const demanding=/\b(explain|calculate|determine|prove|show that|graph|plot|draw|diagram|deduce)\b/i.test(text);
  const complexity=marks+multipart+(demanding?2:0)+Math.min(input.schemePoints??0,4)/2;
  const difficulty=complexity>=6?"HARD":complexity>=3?"MEDIUM":"EASY";
  return {difficulty,confidence:marks?0.88:0.7,reason:`${marks||"Unknown"} marks; ${multipart?"multi-part; ":""}${demanding?"extended reasoning/graph/calculation":"direct response"}.`};
}
