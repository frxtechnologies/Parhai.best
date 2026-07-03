export type MarkingAnswerType="question_answer"|"generic_guidance"|"examiner_note"|"header_footer"|"unknown"|"needs_review";
const GENERIC=/\b(general marking principles?|calculation specific guidance|correct answers? to calculations? should be given full credit|significant figures?|answers? may be awarded|examiners? should|mark scheme is published as an aid|mark schemes? should be read in conjunction|in order to maintain the security|generic guidance|marking principles?|unit guidance)\b/i;
const HEADER=/\b(UCLES|Cambridge International|Cambridge University Press\s*&\s*Assessment|page\s+\d+\s+of\s+\d+|mark scheme\s+published)\b/i;
const EXAMINER=/\b(examiner note|allow|accept|ignore|do not accept|award|credit)\b/i;

export function classifyMarkingSchemeSection(text:string,metadata:{questionNumber?:string|null;questionPart?:string|null;marks?:number|null}={}){
  const value=text.replace(/\s+/g," ").trim();
  if(!value)return{answerType:"unknown" as MarkingAnswerType,isQuestionSpecific:false,questionNumber:null,questionPart:null,marks:null,confidence:0,reason:"Empty section"};
  if(GENERIC.test(value))return{answerType:"generic_guidance" as MarkingAnswerType,isQuestionSpecific:false,questionNumber:null,questionPart:null,marks:null,confidence:.99,reason:"Matched general marking-guidance language"};
  if(HEADER.test(value)&&value.length<220)return{answerType:"header_footer" as MarkingAnswerType,isQuestionSpecific:false,questionNumber:null,questionPart:null,marks:null,confidence:.98,reason:"Matched document header or footer"};
  const label=value.match(/^(?:question\s+|q\s*)?(\d{1,2})(?:\s*(\([a-z]\)(?:\([ivx]+\))?))?(?:[.):\-\s]|$)/i);
  const questionNumber=metadata.questionNumber??label?.[1]??null;
  const questionPart=metadata.questionPart??label?.[2]?.replace(/\s+/g,"")??null;
  const detectedMarks=Number(value.match(/(?:\[|\()\s*(\d{1,2})\s*(?:marks?)?\s*(?:\]|\))/i)?.[1]??0)||null;
  const marks=metadata.marks??detectedMarks;
  const hasAnswerContent=value.replace(/^(?:question\s+|q\s*)?\d{1,2}(?:\s*\([^)]+\)){0,2}\s*/i,"").trim().length>0;
  if(questionNumber&&hasAnswerContent&&(marks!==null||value.length>=3))return{answerType:"question_answer" as MarkingAnswerType,isQuestionSpecific:true,questionNumber:String(Number(questionNumber)),questionPart,marks,confidence:questionPart?.length?.valueOf()?0.98:0.9,reason:"Specific numbered answer section with marking content"};
  if(EXAMINER.test(value))return{answerType:"examiner_note" as MarkingAnswerType,isQuestionSpecific:false,questionNumber:null,questionPart:null,marks,confidence:.8,reason:"Examiner instruction without a reliable question key"};
  return{answerType:"needs_review" as MarkingAnswerType,isQuestionSpecific:false,questionNumber,questionPart,marks,confidence:.35,reason:"No reliable question-specific answer structure"};
}

export function isOfficialQuestionAnswer(answer:any,status?:string|null,question?:any){
  const structurallyValid=Boolean(answer&&answer.answer_type==="question_answer"&&answer.is_question_specific===true&&Number(answer.extraction_confidence??answer.confidence??0)>=.8&&Number(answer.link_confidence??0)>=.8&&(!status||["linked","linked_exact"].includes(status)));
  return structurallyValid&&(!question||validateQuestionMarkSchemePair(question,answer).valid);
}

export function markingSchemeMetadataMatches(question:any,scheme:any){
  return String(question.subject_code??question.syllabus_code??"")===String(scheme.subject_code??scheme.syllabus_code??"")
    && String(question.level??"")===String(scheme.level??"")
    && Number(question.year)===Number(scheme.year)
    && String(question.session??"")===String(scheme.session??"")
    && Number(question.paper_number??question.paper_code)===Number(scheme.paper_number??scheme.paper_code)
    && Number(question.variant)===Number(scheme.variant)
    && String(question.question_number??"").match(/^\d+/)?.[0]===String(scheme.question_number??"").match(/^\d+/)?.[0]
    && (!scheme.question_part||String(question.question_part??"").replace(/\s/g,"")===String(scheme.question_part).replace(/\s/g,""));
}
import{validateQuestionMarkSchemePair}from"./cambridge-identity";
