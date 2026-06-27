import { Router, type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../middleware/auth";
import { generateAiAnswer } from "../lib/ai-service";
import { processResourceById } from "../services/resource-job";

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
  const subjectCode = String(req.params.subjectCode).padStart(4, "0");
  const { data: mapping, error } = await client.from("subject_code_map").select("subject_id").eq("subject_code", subjectCode).single();
  if (error || !mapping) { res.status(404).json({ error: "Subject code was not found." }); return; }
  const { data: resources, error: resourceError } = await client.from("resources").select("id")
    .eq("subject_id", mapping.subject_id).in("resource_type", ["PAST_PAPER","WORKSHEET","TEST","TOPICAL"]);
  if (resourceError) { res.status(422).json({ error: resourceError.message }); return; }
  const failures: Array<{ id: number; error: string }> = [];
  for (const resource of resources ?? []) {
    try { await processResourceById(client, Number(resource.id)); }
    catch (cause) { failures.push({ id: Number(resource.id), error: cause instanceof Error ? cause.message : "Failed" }); }
  }
  res.json({ processed: (resources?.length ?? 0) - failures.length, failed: failures.length, failures });
});

export default router;
