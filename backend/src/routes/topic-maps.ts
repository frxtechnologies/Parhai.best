import { Router, type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../middleware/auth";
import { generateAiAnswer } from "../lib/ai-service";
import { tagQuestionsForSubject } from "../services/topic-tagging";

const router: IRouter = Router();

router.post("/topic-maps/:subjectCode/generate", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const subjectCode = String(req.params.subjectCode).padStart(4, "0");
  const { data: mapping, error: mappingError } = await client.from("subject_code_map")
    .select("subject_id,subjects(name)").eq("subject_code", subjectCode).single();
  if (mappingError || !mapping) { res.status(404).json({ error: "Subject code was not found." }); return; }
  const { data: syllabus, error } = await client.from("resources").select("id,title,extracted_text")
    .eq("subject_id", mapping.subject_id).eq("resource_type", "SYLLABUS").not("extracted_text", "is", null)
    .order("year", { ascending: false }).limit(1).maybeSingle();
  if (error || !syllabus?.extracted_text) { res.status(422).json({ error: "Upload and process a syllabus PDF before generating a topic map." }); return; }
  try {
    const subject = Array.isArray(mapping.subjects) ? mapping.subjects[0] : mapping.subjects;
    const raw = await generateAiAnswer(
      "Extract a Cambridge syllabus topic map. Return JSON only: {items:[{topic,subtopic,syllabus_reference,keywords:string[]}]}",
      `Subject: ${subject?.name ?? subjectCode}\nSyllabus:\n${syllabus.extracted_text.slice(0, 50000)}`,
    );
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as { items?: Array<Record<string, unknown>> };
    const rows = (parsed.items ?? []).filter((item) => item.topic && Array.isArray(item.keywords)).map((item) => ({
      subject_code: subjectCode, topic: String(item.topic), subtopic: String(item.subtopic ?? ""),
      syllabus_reference: item.syllabus_reference ? String(item.syllabus_reference) : null,
      keywords: (item.keywords as unknown[]).map(String), status: "draft", source: "ai_syllabus",
    }));
    if (!rows.length) throw new Error("AI did not return a usable topic map.");
    const { data, error: insertError } = await client.from("topic_maps").upsert(rows, { onConflict: "subject_code,topic,subtopic" }).select();
    if (insertError) throw insertError;
    res.json({ generated: data?.length ?? 0, status: "draft", sourceResourceId: syllabus.id });
  } catch (cause) {
    res.status(422).json({ error: cause instanceof Error ? cause.message : "Topic map generation failed." });
  }
});

router.post("/topic-maps/:subjectCode/rerun", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const subjectCode = String(req.params.subjectCode).match(/\d{4}/)?.[0] ?? String(req.params.subjectCode).trim().padStart(4, "0");
  const { data: mapping, error } = await client.from("subject_code_map").select("subject_id,subjects(name)").eq("subject_code", subjectCode).single();
  if (error || !mapping) { res.status(404).json({ error: "Subject code was not found." }); return; }
  const [{ data: questions, error: questionError }, { count: mapRows, error: mapError }] = await Promise.all([
    client.from("question_index").select("id,question_number,question_text,marks").eq("subject_id", mapping.subject_id).order("id").limit(5000),
    client.from("topic_maps").select("id", { count: "exact", head: true }).eq("subject_code", subjectCode).eq("status", "approved"),
  ]);
  if (questionError || mapError) { res.status(422).json({ error: questionError?.message ?? mapError?.message }); return; }
  if (!questions?.length) {
    res.json({ subjectCode, questionIndexRowsFound: 0, topicMapRowsFound: mapRows ?? 0, questionsUpdated: 0, questionsSkipped: 0, tagged: 0, needsReview: 0, untagged: 0, errors: [], message: `No indexed questions found for ${subjectCode} Physics. Process papers first.` });
    return;
  }
  const subject = Array.isArray(mapping.subjects) ? mapping.subjects[0] : mapping.subjects;
  const tags = await tagQuestionsForSubject(client, subjectCode, subject?.name ?? subjectCode, questions.map((q) => ({ number: String(q.id), text: q.question_text, marks: q.marks })), { useAi: false });
  const updates = questions.map((question) => {
    const tag = tags.get(String(question.id));
    return { id: question.id, topic: tag?.topic ?? "Unclassified", subtopic: tag?.subtopic ?? null, confidence: tag?.confidence ?? 0, difficulty: tag?.difficulty ?? "MEDIUM", syllabus_reference: tag?.syllabusReference ?? null, needs_review: tag?.needsReview ?? true, tagging_method: tag?.method ?? "missing_map", tagging_note: tag?.note ?? "No keyword match. Improve topic keywords or use AI fallback." };
  });
  let updated = 0;
  const errors: string[] = [];
  for (let offset = 0; offset < updates.length; offset += 250) {
    const { data, error: updateError } = await client.rpc("bulk_update_question_topics", { p_updates: updates.slice(offset, offset + 250) });
    if (updateError) errors.push(updateError.message); else updated += Number(data ?? 0);
  }
  const tagged = updates.filter((row) => row.topic !== "Unclassified").length;
  const needsReview = updates.filter((row) => row.needs_review).length;
  const untagged = updates.length - tagged;
  const message = tagged === 0
    ? "Questions found but no keyword matches. Improve topic keywords or use AI fallback."
    : `Detection completed: ${tagged} tagged, ${needsReview} needs review, ${untagged} untagged.`;
  res.json({ subjectCode, questionIndexRowsFound: questions.length, topicMapRowsFound: mapRows ?? 0, questionsUpdated: updated, questionsSkipped: questions.length - updated, tagged, needsReview, untagged, errors, message });
});

export default router;
