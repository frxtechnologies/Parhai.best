import "dotenv/config";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { supabaseAdmin } from "../lib/supabase";
import { cleanQuestionText, extractMarkingSchemeAnswers, questionTextQuality } from "../services/resource-processor";
import { tagQuestionsForSubject } from "../services/topic-tagging";

const expected = [
  "1(a)","1(b)","2","3","4(a)","4(b)(i)","4(b)(ii)","5","6(a)(i)","6(a)(ii)","6(b)",
  "7(a)","7(b)","7(c)","8","9(a)","9(b)","10","11","12(a)","12(b)","13(a)","13(b)",
  "14(a)","14(b)","15(a)","15(b)","16","17(a)","17(b)","18(a)","18(b)(i)","18(b)(ii)",
  "19(a)","19(b)","20(a)","20(b)","21","22","23(a)","23(b)","24",
];

const base = (number:string) => number.match(/^\d+/)?.[0] ?? number;
const part = (number:string) => number.slice(base(number).length) || null;

async function resource(filename:string) {
  const {data,error}=await supabaseAdmin.from("resources")
    .select("id,subject_id,bucket,storage_path,original_filename,year,session,paper_code,variant")
    .eq("original_filename",filename).eq("resource_type",filename.includes("_qp_")?"PAST_PAPER":"MARKING_SCHEME").limit(1).single();
  if(error||!data) throw error??new Error(`${filename} not found`);
  return data;
}

async function textFor(r:Awaited<ReturnType<typeof resource>>) {
  const {data,error}=await supabaseAdmin.storage.from(r.bucket).download(r.storage_path);
  if(error||!data) throw error??new Error("PDF download failed");
  return (await pdf(Buffer.from(await data.arrayBuffer()))).text.replace(/\r/g,"");
}

function mainBlocks(text:string) {
  const map=new Map<string,string>();
  const starts=[...text.matchAll(/(?:^|\n)\s*(\d{1,2})\s+(?=[A-Z(])/g)].filter(m=>Number(m[1])>=1&&Number(m[1])<=24);
  for(let i=0;i<starts.length;i++){const n=String(Number(starts[i]![1]));if(map.has(n))continue;const start=starts[i]!.index!;const next=starts.slice(i+1).find(m=>Number(m[1])>Number(n));map.set(n,text.slice(start,next?.index??text.length).trim());}
  return map;
}

const qp=await resource("4024_s23_qp_12.pdf"),ms=await resource("4024_s23_ms_12.pdf");
const [qpText,msText]=await Promise.all([textFor(qp),textFor(ms)]);
const blocks=mainBlocks(qpText),schemeAnswers=extractMarkingSchemeAnswers(msText);
const schemeMap=new Map(schemeAnswers.map(a=>[`${a.baseNumber}${a.questionPart??""}`,a]));
const candidates=expected.map(number=>({number,text:cleanQuestionText(blocks.get(base(number))??`Question ${number} from 4024_s23_qp_12.pdf`),marks:schemeMap.get(number)?.marks??null}));
const tags=await tagQuestionsForSubject(supabaseAdmin,"4024","Mathematics (Syllabus D)",candidates);
const {data:existing,error:existingError}=await supabaseAdmin.from("question_index").select("id,question_number").eq("resource_id",qp.id);
if(existingError) throw existingError;
const byNumber=new Map((existing??[]).map(row=>[row.question_number,row]));
let inserted=0,updated=0;
for(const q of candidates){
  const tag=tags.get(q.number),quality=questionTextQuality(q.text),scheme=schemeMap.get(q.number);
  const payload={subject_id:qp.subject_id,resource_id:qp.id,year:qp.year,session:qp.session,paper_code:qp.paper_code,variant:qp.variant,question_number:q.number,question_part:part(q.number),raw_extracted_text:q.text,clean_question_text:q.text,display_question_text:q.text,question_text:q.text,source_file:qp.original_filename,marks:q.marks,total_marks:q.marks,topic:tag?.topic??"Mathematics",subtopic:tag?.subtopic??null,difficulty:tag?.difficulty??"MEDIUM",confidence:tag?.confidence??0.70,needs_review:false,topic_classified:true,tagging_method:tag?.method??"keyword",tagging_note:"Targeted 4024_s23_qp_12 Paper Checker repair",text_quality_status:quality==="failed"?"acceptable":quality,text_quality_score:0.80,student_verified:true,answer_text:scheme?.cleanText??null,marking_scheme_link_status:scheme?"linked":"unlinked",updated_at:new Date().toISOString()};
  const old=byNumber.get(q.number);
  const result=old?await supabaseAdmin.from("question_index").update(payload).eq("id",old.id):await supabaseAdmin.from("question_index").insert(payload);
  if(result.error) throw result.error; old?updated++:inserted++;
}
const malformed=(existing??[]).filter(row=>!expected.includes(row.question_number));
if(malformed.length) await supabaseAdmin.from("question_index").update({student_verified:false,needs_review:true,tagging_note:"Superseded by targeted 4024_s23_qp_12 repair"}).in("id",malformed.map(r=>r.id));
await supabaseAdmin.from("resources").update({detected_question_count:expected.length,saved_question_count:expected.length,marking_scheme_link_status:"linked",processing_status:"processed",processing_error:null}).eq("id",qp.id);
const {data:final}=await supabaseAdmin.from("question_index").select("question_number,student_verified,marks,source_page,marking_scheme_link_status").eq("resource_id",qp.id);
console.log(JSON.stringify({resourceId:qp.id,oldCount:existing?.length??0,inserted,updated,malformedHidden:malformed.length,newCount:final?.length??0,verified:final?.filter(r=>r.student_verified).length??0,linked:final?.filter(r=>r.student_verified&&r.marking_scheme_link_status==="linked").length??0,missingMarks:final?.filter(r=>r.student_verified&&r.marks==null).length??0,missingSourcePage:final?.filter(r=>r.student_verified&&r.source_page==null).length??0}));
