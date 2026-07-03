export type CambridgeIdentity={
  syllabusCode:string|null;level:string|null;year:number|null;session:string|null;
  paperNumber:number|null;variant:number|null;componentVariantCode:string|null;
  questionNumber:string|null;questionPart:string|null;
};

const normalizedLevel=(value:unknown)=>String(value??"").trim().toUpperCase().replace(/\s+/g,"_")||null;
const normalizedSession=(value:unknown)=>String(value??"").trim().toUpperCase().replace(/[ /]+/g,"_")||null;
const numberOrNull=(value:unknown)=>Number.isFinite(Number(value))?Number(value):null;
const textOrNull=(value:unknown)=>String(value??"").trim()||null;

export function splitQuestionIdentity(value:unknown,part?:unknown){
  const raw=String(value??"").replace(/\s+/g,"");
  const base=raw.match(/^\d+/)?.[0]??null;
  const embedded=raw.slice(base?.length??0)||null;
  return{questionNumber:base,questionPart:textOrNull(part)??embedded};
}

export function buildCambridgeIdentity(row:Record<string,any>):CambridgeIdentity{
  const resource=Array.isArray(row.resources)?row.resources[0]:row.resources;
  const nestedSubject=resource?(Array.isArray(resource.subjects)?resource.subjects[0]:resource.subjects):null;
  const subject=(Array.isArray(row.subjects)?row.subjects[0]:row.subjects)??nestedSubject;
  const question=splitQuestionIdentity(row.question_number,row.question_part);
  const paperNumber=numberOrNull(row.paper_number??row.component_number??row.paper_code??resource?.paper_number??resource?.paper_code);
  const variant=numberOrNull(row.variant??resource?.variant);
  return{
    syllabusCode:textOrNull(row.syllabus_code??row.subject_code??subject?.code),
    level:normalizedLevel(row.level??resource?.level??subject?.level),
    year:numberOrNull(row.year??resource?.year),
    session:normalizedSession(row.session??resource?.session),
    paperNumber,variant,componentVariantCode:paperNumber&&variant?`${paperNumber}${variant}`:null,
    ...question,
  };
}

export function compareCambridgeIdentity(question:CambridgeIdentity,answer:CambridgeIdentity){
  const fields:(keyof CambridgeIdentity)[]=["syllabusCode","level","year","session","paperNumber","variant","componentVariantCode","questionNumber"];
  if(answer.questionPart)fields.push("questionPart");
  const mismatchFields=fields.filter(field=>question[field]===null||answer[field]===null||question[field]!==answer[field]);
  return{match:mismatchFields.length===0,mismatchFields,reason:mismatchFields.length?`Identity mismatch: ${mismatchFields.join(", ")}`:"Exact Cambridge identity match"};
}

export function validateQuestionMarkSchemePair(questionRow:Record<string,any>,answerRow:Record<string,any>){
  const questionIdentity=buildCambridgeIdentity(questionRow),markingIdentity=buildCambridgeIdentity(answerRow);
  const comparison=compareCambridgeIdentity(questionIdentity,markingIdentity);
  const reasons=[...(comparison.match?[]:[comparison.reason])];
  if(answerRow.answer_type!=="question_answer")reasons.push(`answer_type is ${answerRow.answer_type??"missing"}`);
  if(answerRow.is_question_specific!==true)reasons.push("answer is not question-specific");
  if(Number(answerRow.extraction_confidence??answerRow.confidence??0)<.8)reasons.push("extraction confidence is below 0.8");
  if(Number(answerRow.link_confidence??0)<.8)reasons.push("link confidence is below 0.8");
  return{valid:reasons.length===0,status:reasons.length?"invalid_link":"linked",mismatchFields:comparison.mismatchFields,reasons,questionIdentity,markingIdentity};
}
