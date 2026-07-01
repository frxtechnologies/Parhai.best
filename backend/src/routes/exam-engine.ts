import { Router,type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "../middleware/auth";
import { createExamEngine,type ExamFilters } from "../services/exam-engine";

const router:IRouter=Router();
const number=(value:unknown)=>value==null||value===""?undefined:Number(value);
function filters(query:Record<string,unknown>):ExamFilters {
  return {
    subjectCode:String(query.subject_code??"")||undefined,subjectId:number(query.subject_id),
    year:number(query.year),yearFrom:number(query.year_from),yearTo:number(query.year_to),
    session:String(query.session??"")||undefined,paperNumber:number(query.paper_number),
    variant:number(query.variant),topic:String(query.topic??"")||undefined,
    subtopic:String(query.subtopic??"")||undefined,
    difficulty:["EASY","MEDIUM","HARD"].includes(String(query.difficulty))?String(query.difficulty) as ExamFilters["difficulty"]:undefined,
    markingSchemeOnly:String(query.marking_scheme_only)==="true",limit:number(query.limit),offset:number(query.offset),
  };
}

router.get("/exam-engine/papers",requireUser,async(req,res)=>{
  try{res.json(await createExamEngine(res.locals.supabase as SupabaseClient).findPapers(filters(req.query as Record<string,unknown>)));}
  catch(error){res.status(422).json({error:error instanceof Error?error.message:"Paper search failed."});}
});

router.get("/exam-engine/questions",requireUser,async(req,res)=>{
  try{res.json(await createExamEngine(res.locals.supabase as SupabaseClient).findQuestions(filters(req.query as Record<string,unknown>)));}
  catch(error){res.status(422).json({error:error instanceof Error?error.message:"Question search failed."});}
});

router.get("/exam-engine/questions/:questionId",requireUser,async(req,res)=>{
  try{res.json(await createExamEngine(res.locals.supabase as SupabaseClient).getQuestionWithSources(Number(req.params.questionId)));}
  catch(error){res.status(404).json({error:error instanceof Error?error.message:"Question not found."});}
});

router.get("/exam-engine/questions/:questionId/marking-scheme",requireUser,async(req,res)=>{
  try{
    const engine=createExamEngine(res.locals.supabase as SupabaseClient);
    const [link,source]=await Promise.all([engine.getLinkedMarkingScheme(Number(req.params.questionId)),engine.getMarkingSchemeScreenshot(Number(req.params.questionId))]);
    if(!link){res.status(404).json({error:"No official marking scheme is linked for this question."});return;}
    res.json({status:link.marking_scheme_link_status,answer:link.answer_text,source});
  } catch(error){res.status(404).json({error:error instanceof Error?error.message:"Marking scheme unavailable."});}
});

router.get("/exam-engine/paper-analysis",requireUser,async(req,res)=>{
  const f=filters(req.query as Record<string,unknown>);
  if(!f.subjectCode||!f.year||!f.session||!f.paperNumber||!f.variant){res.status(400).json({error:"subject_code, year, session, paper_number, and variant are required."});return;}
  try{res.json(await createExamEngine(res.locals.supabase as SupabaseClient).getTopicCountsForPaper({subjectCode:f.subjectCode,year:f.year,session:f.session,paperNumber:f.paperNumber,variant:f.variant}));}
  catch(error){res.status(422).json({error:error instanceof Error?error.message:"Paper analysis failed."});}
});

router.get("/exam-engine/topic-trend",requireUser,async(req,res)=>{
  try{res.json({trend:await createExamEngine(res.locals.supabase as SupabaseClient).getTopicTrend(filters(req.query as Record<string,unknown>))});}
  catch(error){res.status(422).json({error:error instanceof Error?error.message:"Topic trend failed."});}
});

router.get("/exam-engine/memory",requireUser,async(_req,res)=>{
  try{res.json(await createExamEngine(res.locals.supabase as SupabaseClient).getStudentProgressMemory(res.locals.user.id));}
  catch(error){res.status(422).json({error:error instanceof Error?error.message:"Learning memory is not available."});}
});

router.post("/exam-engine/activity",requireUser,async(req,res)=>{
  const questionId=Number(req.body?.question_id),activityType=String(req.body?.activity_type??"");
  if(!Number.isInteger(questionId)||!["viewed","attempted","completed","saved"].includes(activityType)){res.status(400).json({error:"Valid question_id and activity_type are required."});return;}
  const client=res.locals.supabase as SupabaseClient;
  const {data,error}=await client.from("student_question_activity").insert({
    user_id:res.locals.user.id,question_id:questionId,activity_type:activityType,
    is_correct:typeof req.body?.is_correct==="boolean"?req.body.is_correct:null,
    awarded_marks:number(req.body?.awarded_marks),max_marks:number(req.body?.max_marks),source:String(req.body?.source??"question_bank"),
  }).select("*").single();
  if(error){res.status(422).json({error:error.message});return;}res.status(201).json(data);
});

export default router;
