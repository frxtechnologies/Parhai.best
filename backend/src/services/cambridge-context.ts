import type { SupabaseClient } from "@supabase/supabase-js";
import { markTypedAnswer } from "./paper-checker";
import {isOfficialQuestionAnswer} from "./marking-scheme-intelligence";

export async function getQuestionContext(client: SupabaseClient, resourceId: number) {
  const { data, error } = await client.from("question_index")
    .select("id,resource_id,subject_id,year,session,paper_code,variant,question_number,question_part,display_question_text,clean_question_text,question_text,topic,subtopic,total_marks,marks,answer_text,marking_scheme_answer_id,marking_scheme_link_status,confidence,resources(level,year,session,paper_number,paper_code,variant),subjects(code,level)")
    .eq("resource_id", resourceId).eq("student_verified", true).order("id");
  if (error) throw error;
  const rows=data??[],answerIds=[...new Set(rows.map(row=>Number(row.marking_scheme_answer_id)).filter(Boolean))];
  const answers=answerIds.length?await client.from("marking_scheme_answers").select("id,resource_id,syllabus_code,level,year,session,paper_number,variant,question_number,question_part,answer_type,is_question_specific,confidence,extraction_confidence,link_confidence,resources(level,year,session,paper_number,paper_code,variant,subjects(code,level))").in("id",answerIds):{data:[],error:null};
  if(answers.error)throw answers.error;
  const byId=new Map((answers.data??[]).map(answer=>[Number(answer.id),answer]));
  return rows.map(row=>({...row,marking_scheme_answers:row.marking_scheme_answer_id?byId.get(Number(row.marking_scheme_answer_id))??null:null}));
}

export function getLinkedMarkingScheme<T extends { answer_text?: string | null; marking_scheme_link_status?: string | null; marking_scheme_answer_id?: number | null;marking_scheme_answers?:any }>(question: T) {
  const answer=Array.isArray(question.marking_scheme_answers)?question.marking_scheme_answers[0]:question.marking_scheme_answers;
  const linked = Boolean(question.answer_text?.trim()) && isOfficialQuestionAnswer(answer,question.marking_scheme_link_status,question);
  return linked ? { answerText: question.answer_text!.trim(), answerId: question.marking_scheme_answer_id ?? null, status: question.marking_scheme_link_status } : null;
}

export async function getTopicContext(client: SupabaseClient, subjectCode: string) {
  const { data, error, count } = await client.from("topic_maps").select("topic,subtopic,keywords", { count: "exact" })
    .eq("subject_code", subjectCode).eq("status", "approved");
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

export async function getSimilarQuestions(client: SupabaseClient, input: { subjectId: number; topic: string | null; subtopic?: string | null; excludeIds?: number[]; limit?: number }) {
  let query = client.from("question_index").select("id,resource_id,question_number,topic,subtopic,year,session,paper_code,variant,total_marks,marks")
    .eq("subject_id", input.subjectId).eq("student_verified", true);
  if (input.topic) query = query.ilike("topic", input.topic);
  if (input.subtopic) query = query.ilike("subtopic", input.subtopic);
  if (input.excludeIds?.length) query = query.not("id", "in", `(${input.excludeIds.join(",")})`);
  const { data, error } = await query.order("confidence", { ascending: false }).order("year", { ascending: false }).limit(input.limit ?? 3);
  if (error) throw error;
  return data ?? [];
}

export function generateExamFeedback(input: { studentAnswer: string; question: { answer_text?: string | null; marking_scheme_link_status?: string | null; marking_scheme_answer_id?: number | null; total_marks?: number | null; marks?: number | null } }) {
  const scheme = getLinkedMarkingScheme(input.question);
  return markTypedAnswer({ studentAnswer: input.studentAnswer, officialAnswer: scheme?.answerText ?? null, maxMarks: Number(input.question.total_marks ?? input.question.marks ?? 0) });
}
