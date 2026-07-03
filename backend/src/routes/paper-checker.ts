import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { requireUser } from "../middleware/auth";
import { isServiceRoleConfigured, supabaseAdmin } from "../lib/supabase";
import { generateExamFeedback, getLinkedMarkingScheme, getQuestionContext, getSimilarQuestions, getTopicContext } from "../services/cambridge-context";
import { answerExtractionService } from "../services/answer-extraction";
import { recordPaperCheckerPerformance } from "../services/paper-checker-feedback";

const router: IRouter = Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,file.mimetype==="application/pdf"||file.originalname.toLowerCase().endsWith(".pdf"))});

router.get("/paper-checker/papers", requireUser, async (_req,res) => {
  const {data,error}=await supabaseAdmin.from("resources")
    .select("id,subject_id,year,session,paper_number,paper_code,variant,original_filename,subjects(name,code),question_index!inner(id,question_number,student_verified,marking_scheme_link_status)")
    .eq("resource_type","PAST_PAPER").eq("is_approved",true)
    .order("year",{ascending:false});
  if(error){res.status(422).json({error:error.message});return;}
  const rows=(data??[]).map((paper)=>{
    const questions=paper.question_index??[];
    const baseNumber=(value:string|null)=>{
      const match=String(value??"").match(/^\s*(\d+)/);
      return match?Number(match[1]):null;
    };
    const allNumbers=new Set(questions.map((q)=>baseNumber(q.question_number)).filter((n):n is number=>n!==null));
    const verifiedNumbers=new Set(questions.filter((q)=>q.student_verified).map((q)=>baseNumber(q.question_number)).filter((n):n is number=>n!==null));
    const linkedNumbers=new Set(questions.filter((q)=>["linked","partial"].includes(q.marking_scheme_link_status)).map((q)=>baseNumber(q.question_number)).filter((n):n is number=>n!==null));
    // Legacy extraction can contain malformed high question numbers. Verified
    // coverage is the safest available paper-length signal until an explicit
    // expected-question metadata field is added.
    const expectedQuestionCount=verifiedNumbers.size?Math.max(...verifiedNumbers):(allNumbers.size?Math.max(...allNumbers):null);
    return {...paper,question_index:undefined,indexed_question_count:questions.length,
      verified_question_count:questions.filter((q)=>q.student_verified).length,
      marking_scheme_linked_count:questions.filter((q)=>["linked","partial"].includes(q.marking_scheme_link_status)).length,
      indexed_question_number_count:allNumbers.size,
      verified_question_number_count:verifiedNumbers.size,
      marking_scheme_linked_question_count:linkedNumbers.size,
      expected_question_count:expectedQuestionCount,
      question_paper_code:paper.original_filename?.replace(/\.pdf$/i,"")??null};
  }).filter((paper)=>paper.indexed_question_count>0);
  res.json({papers:rows});
});

router.get("/paper-checker/papers/:resourceId/questions", requireUser, async (req,res) => {
  const resourceId=Number(req.params.resourceId);
  try {
    const data=await getQuestionContext(res.locals.supabase,resourceId);
    res.json({questions:data.map((q)=>({...q,answer_text:undefined,scheme_linked:Boolean(getLinkedMarkingScheme(q))}))});
  } catch(error) { res.status(422).json({error:error instanceof Error?error.message:"Could not load paper questions."}); }
});

async function uploadSubmission(req: Request,res: Response){
  if(!isServiceRoleConfigured){res.status(503).json({error:"Paper Checker upload needs SUPABASE_SERVICE_ROLE_KEY on the backend. The key must never be added to the frontend."});return;}
  const user=res.locals.user as {id:string};const resourceId=Number(req.body?.resourceId);const file=req.file;
  if(!file){res.status(400).json({error:"Upload a solved paper PDF."});return;}
  const {data:paper}=await supabaseAdmin.from("resources").select("id,subject_id,year,session,paper_number,paper_code,variant,subjects(code)").eq("id",resourceId).eq("resource_type","PAST_PAPER").single();
  if(!paper){res.status(404).json({error:"Selected paper was not found."});return;}
  const subject=Array.isArray(paper.subjects)?paper.subjects[0]:paper.subjects;
  const {data:submission,error}=await supabaseAdmin.from("paper_check_submissions").insert({user_id:user.id,resource_id:paper.id,subject_code:(subject as {code?:string}|null)?.code??"",year:paper.year,session:paper.session,paper_number:paper.paper_number??Number(paper.paper_code),variant:paper.variant,status:"processing",extraction_status:"extracting"}).select("id").single();
  if(error||!submission){res.status(422).json({error:error?.message??"Could not create submission."});return;}
  const path=`${user.id}/${submission.id}/original/${file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const {error:storageError}=await supabaseAdmin.storage.from("paper-checker-submissions").upload(path,file.buffer,{contentType:"application/pdf",upsert:false});
  if(storageError){await supabaseAdmin.from("paper_check_submissions").update({status:"failed",extraction_status:"failed"}).eq("id",submission.id);res.status(422).json({error:"The solved paper could not be stored privately."});return;}
  const extraction=await answerExtractionService.extract(file.buffer);const questions=await getQuestionContext(supabaseAdmin,resourceId);
  const detected=new Map(extraction.answers.map((a)=>[a.questionNumber,a]));
  const {data:rows,error:rowsError}=await supabaseAdmin.from("paper_check_extracted_answers").insert(questions.map((q)=>{const found=detected.get(q.question_number);return{submission_id:submission.id,question_id:q.id,question_number:q.question_number,question_part:q.question_part,extracted_answer_text:found?.text??"",extraction_confidence:found?.confidence??0,page_number:found?.pageNumber??null,needs_student_review:!found||found.needsReview};})).select("*").order("id");
  if(rowsError){res.status(422).json({error:rowsError.message});return;}
  await supabaseAdmin.from("paper_check_submissions").update({uploaded_file_path:path,upload_file_name:file.originalname,extraction_status:extraction.status,status:"needs_review",updated_at:new Date().toISOString()}).eq("id",submission.id);
  res.status(201).json({submissionId:submission.id,extractionStatus:extraction.status,message:extraction.message,renderedPages:extraction.renderedPages??0,answers:rows??[]});
}
router.post("/paper-checker/upload",requireUser,upload.single("file"),uploadSubmission);
router.post("/paper-checker/submissions",requireUser,upload.single("file"),uploadSubmission);

router.post("/paper-checker/check", requireUser, async (req,res) => {
  if(!isServiceRoleConfigured){res.status(503).json({error:"Paper marking is unavailable because the backend service role is not configured."});return;}
  const user=res.locals.user as {id:string};
  const resourceId=Number(req.body?.resourceId);
  const existingSubmissionId=typeof req.body?.submissionId==="string"?req.body.submissionId:null;
  const submitted=Array.isArray(req.body?.answers)?req.body.answers as Array<{questionId:number;answer:string}>:[];
  const {data:paper,error:paperError}=await supabaseAdmin.from("resources")
    .select("id,subject_id,year,session,paper_number,paper_code,variant,subjects(code)")
    .eq("id",resourceId).eq("resource_type","PAST_PAPER").eq("is_approved",true).single();
  if(paperError||!paper){res.status(404).json({error:"Selected paper was not found."});return;}
  const questions=await getQuestionContext(supabaseAdmin,resourceId);
  if(!questions.length){res.status(422).json({error:"This paper has no verified indexed questions."});return;}
  const subject=Array.isArray(paper.subjects)?paper.subjects[0]:paper.subjects;
  const existing=existingSubmissionId?await supabaseAdmin.from("paper_check_submissions").select("id,user_id,uploaded_file_path").eq("id",existingSubmissionId).eq("user_id",user.id).maybeSingle():null;
  const created=existing?.data?{data:{id:existing.data.id},error:null}:await supabaseAdmin.from("paper_check_submissions").insert({
    user_id:user.id,resource_id:paper.id,subject_code:(subject as {code?:string}|null)?.code??"",
    year:paper.year,session:paper.session,paper_number:paper.paper_number??Number(paper.paper_code),variant:paper.variant,status:"processing",
  }).select("id").single();
  const {data:submission,error:submissionError}=created;
  if(submissionError||!submission){res.status(422).json({error:submissionError?.message??"Could not create paper check."});return;}
  const answerMap=new Map(submitted.map((row)=>[Number(row.questionId),String(row.answer??"").slice(0,10000)]));
  const results=questions.map((question)=>{
    const maxMarks=Number(question.total_marks??question.marks??0);
    const studentAnswer=answerMap.get(Number(question.id))??"";
    return {...question,studentAnswer,maxMarks,...generateExamFeedback({studentAnswer,question})};
  });
  const totalPossible=results.filter((r)=>r.awardedMarks!==null).reduce((sum,r)=>sum+r.maxMarks,0);
  const totalAwarded=results.reduce((sum,r)=>sum+(r.awardedMarks??0),0);
  const percentage=totalPossible?Number((totalAwarded/totalPossible*100).toFixed(2)):0;
  const {error:answersError}=await supabaseAdmin.from("paper_check_answers").insert(results.map((r)=>({
    submission_id:submission.id,question_id:r.id,question_number:r.question_number,question_part:r.question_part,
    student_answer:r.studentAnswer,awarded_marks:r.awardedMarks,max_marks:r.maxMarks,feedback:r.feedback,
    examiner_tip:r.examinerTip,missing_points:r.missingPoints,correct_points:r.correctPoints,
    mistake_type:r.mistakeType,confidence:r.confidence,marking_status:r.markingStatus,
  })));
  if(answersError){await supabaseAdmin.from("paper_check_submissions").update({status:"failed"}).eq("id",submission.id);res.status(422).json({error:answersError.message});return;}
  const needsReview=results.some((r)=>r.markingStatus!=="official_scheme"||r.confidence<0.7);
  await supabaseAdmin.from("paper_check_submissions").update({
    status:needsReview?"needs_review":"completed",marking_status:needsReview?"needs_review":"completed",total_awarded_marks:totalAwarded,total_possible_marks:totalPossible,percentage,updated_at:new Date().toISOString(),
  }).eq("id",submission.id);
  let learningMemory={events:0,topics:0};
  try{
    learningMemory=await recordPaperCheckerPerformance(supabaseAdmin,{
      userId:user.id,subjectId:Number(paper.subject_id),submissionId:submission.id,results,
    });
  }catch(error){
    req.log.warn({submissionId:submission.id,error:error instanceof Error?error.message:String(error)},"Paper Checker learning memory update failed");
  }
  const topicContext=await getTopicContext(supabaseAdmin,(subject as {code?:string}|null)?.code??"");
  const weakest=[...results].filter((r)=>r.awardedMarks!==null).sort((a,b)=>(a.awardedMarks!/Math.max(a.maxMarks,1))-(b.awardedMarks!/Math.max(b.maxMarks,1)))[0];
  const similarQuestions=weakest?await getSimilarQuestions(supabaseAdmin,{subjectId:paper.subject_id,topic:weakest.topic,subtopic:weakest.subtopic,excludeIds:questions.map((q)=>Number(q.id)),limit:3}):[];
  const deleteUpload=process.env.PAPER_CHECKER_DELETE_UPLOAD_AFTER_REPORT!=="false";
  const uploadedPath=existing?.data?.uploaded_file_path;
  if(deleteUpload&&uploadedPath){
    const deletedAt=new Date().toISOString();
    const{error:deleteError}=await supabaseAdmin.storage.from("paper-checker-submissions").remove([uploadedPath]);
    await supabaseAdmin.from("paper_check_submissions").update(deleteError
      ?{file_retention_status:"deletion_failed",updated_at:deletedAt}
      :{uploaded_file_deleted:true,uploaded_file_deleted_at:deletedAt,file_retention_status:"deleted",uploaded_file_path:null,updated_at:deletedAt}
    ).eq("id",submission.id);
  }
  res.json({submissionId:submission.id,totalAwarded,totalPossible,percentage,status:needsReview?"needs_review":"completed",results,similarQuestions,topicMapAvailable:topicContext.count>0,learningMemory});
});

export default router;
