import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { ingestPhysics2024PaperOne } from "../services/physics-ingestion";
import type { SupabaseClient } from "@supabase/supabase-js";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { parsePaperOneQuestions } from "../services/physics-paper-parser";
import { classifyQuestions, isAiConfigured } from "../lib/ai-service";
import { canonicalTopic, fallbackTopicForSubject } from "../services/rag-utils";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf"));
  },
});

const Fields = z.object({
  session: z.enum(["MAY_JUNE", "OCT_NOV", "FEB_MAR"]).optional(),
  variant: z.coerce.number().int().min(1).max(9).nullable().optional(),
});

router.post(
  "/ingest/physics-2024-paper-1",
  requireAdmin,
  upload.fields([
    { name: "paper", maxCount: 1 },
    { name: "markingScheme", maxCount: 1 },
  ]),
  async (req, res): Promise<void> => {
    try {
      const parsed = Fields.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid upload metadata." });
        return;
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const paper = files?.paper?.[0];
      const markingScheme = files?.markingScheme?.[0];
      if (!paper || !markingScheme) {
        res.status(400).json({ error: "Both the Physics question paper and marking scheme PDFs are required." });
        return;
      }

      const result = await ingestPhysics2024PaperOne({
        supabase: res.locals.supabase as SupabaseClient,
        paperBuffer: paper.buffer,
        paperFilename: paper.originalname,
        markingSchemeBuffer: markingScheme.buffer,
        markingSchemeFilename: markingScheme.originalname,
        session: parsed.data.session,
        variant: parsed.data.variant,
      });
      res.status(201).json(result);
    } catch (error) {
      req.log.error({ error }, "Physics paper ingestion failed");
      res.status(422).json({ error: error instanceof Error ? error.message : "PDF ingestion failed." });
    }
  }
);

router.post("/papers/:paperId/process", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const paperId = Number(req.params.paperId);
  try {
    const { data: paper, error } = await client.from("papers")
      .select("id,subject_id,storage_path,file_url,year,subjects(code,name)").eq("id", paperId).single();
    if (error || !paper) { res.status(404).json({ error: "Paper metadata was not found." }); return; }
    const path = paper.storage_path ?? paper.file_url;
    if (!path) { res.status(400).json({ error: "The paper has no Storage path." }); return; }
    await client.from("papers").update({ ingestion_status: "processing", processing_error: null }).eq("id", paperId);
    await client.from("uploads").update({ status: "processing", error_message: null }).eq("paper_id", paperId).eq("source_type", "QUESTION_PAPER");

    const { data: file, error: downloadError } = await client.storage.from("papers").download(path);
    if (downloadError || !file) throw downloadError ?? new Error("PDF not found in Storage.");
    const parsed = await pdf(Buffer.from(await file.arrayBuffer()));
    const questions = parsePaperOneQuestions(parsed.text);
    if (questions.length === 0) throw new Error("No numbered questions could be extracted from this PDF.");
    const subject = Array.isArray(paper.subjects) ? paper.subjects[0] : paper.subjects;
    let classificationWarning: string | null = null;
    let topics = new Map();
    if (isAiConfigured()) {
      try {
        topics = await classifyQuestions(subject?.name ?? subject?.code ?? "the subject", questions.map(q => ({ number: q.number, text: q.text })));
      } catch (classificationError) {
        classificationWarning = classificationError instanceof Error ? classificationError.message : "AI classification failed.";
      }
    } else {
      classificationWarning = "AI provider is not configured; deterministic subject topic tagging was used.";
    }
    await client.from("questions").delete().eq("paper_id", paperId);
    const { data: saved, error: saveError } = await client.from("questions").insert(questions.map(q => {
      const detected = topics.get(q.number);
      return { paper_id: paperId, subject_id: paper.subject_id, question_number: q.number, question: q.text, extracted_text: q.text, marks: q.marks, topic: detected?.topic ? canonicalTopic(detected.topic) : fallbackTopicForSubject(q.text, subject?.name ?? subject?.code ?? "Subject"), subtopic: detected?.subtopic ?? null, difficulty: detected?.difficulty ?? "MEDIUM", answer: null, marking_points: [], year: paper.year, ai_summary: detected?.summary ?? null };
    })).select("id,question_number,topic,subtopic,difficulty,question,question_text,marks");
    if (saveError) throw saveError;
    const topicNames = [...new Set((saved ?? []).map((question) => question.topic).filter((name) => name && name !== "Unclassified"))];
    if (topicNames.length) {
      const { data: savedTopics, error: topicError } = await client.from("topics").upsert(
        topicNames.map((name) => ({ subject_id: paper.subject_id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })),
        { onConflict: "subject_id,slug" }
      ).select("id,name");
      if (topicError) throw topicError;
      const topicIds = new Map((savedTopics ?? []).map((topic) => [topic.name, topic.id]));
      const links = (saved ?? []).flatMap((question) => topicIds.has(question.topic) ? [{ question_id: question.id, topic_id: topicIds.get(question.topic), confidence: 1, source: isAiConfigured() ? "ai" : "fallback" }] : []);
      if (links.length) {
        const { error: linkError } = await client.from("question_topics").upsert(links, { onConflict: "question_id,topic_id" });
        if (linkError) throw linkError;
      }
    }
    await client.from("papers").update({ ingestion_status: classificationWarning ? "ready_with_classification_warning" : "ready_without_embeddings", raw_text: parsed.text, processing_error: classificationWarning }).eq("id", paperId);
    await client.from("uploads").update({ status: "processed", processed_at: new Date().toISOString() }).eq("paper_id", paperId).eq("source_type", "QUESTION_PAPER");
    res.json({ paperId, extracted: saved?.length ?? 0, aiClassified: topics.size, classificationWarning, questions: saved ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Paper processing failed.";
    await client.from("papers").update({ ingestion_status: "failed", processing_error: message }).eq("id", paperId);
    await client.from("uploads").update({ status: "failed", error_message: message }).eq("paper_id", paperId).eq("source_type", "QUESTION_PAPER");
    res.status(422).json({ error: message });
  }
});

export default router;
