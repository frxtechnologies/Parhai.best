import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { getAllTaxonomyTopics, isValidSubtopicId, getSubtopicName } from "../services/physics-taxonomy-classifier";

const router: IRouter = Router();

/** List all taxonomy topic IDs and names (public — used by admin UI). */
router.get("/admin/physics/taxonomy", requireAdmin, (_req, res): void => {
  res.json({ topics: getAllTaxonomyTopics() });
});

/**
 * List questions that need manual review (taxonomy_topic_id is null OR needs_review=true).
 * Supports ?subject_code=0625&limit=50&offset=0
 */
router.get("/admin/physics/needs-review", requireAdmin, async (req, res): Promise<void> => {
  const subject_code = z.string().optional().parse(req.query.subject_code) ?? "0625";
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  // question_index has no subject_code column — resolve subject_id via subjects.
  const { data: subjects, error: subjErr } = await supabaseAdmin
    .from("subjects").select("id").eq("code", subject_code);
  if (subjErr) { res.status(500).json({ error: subjErr.message }); return; }
  const subjectIds = (subjects ?? []).map((s) => s.id as number);
  if (subjectIds.length === 0) { res.json({ total: 0, limit, offset, questions: [] }); return; }

  const { data, error, count } = await supabaseAdmin
    .from("question_index")
    .select(
      "id,year,session,paper_code,variant,question_number,topic,subtopic,clean_question_text,taxonomy_topic_id,taxonomy_confidence,needs_review",
      { count: "exact" },
    )
    .in("subject_id", subjectIds)
    .or("taxonomy_topic_id.is.null,needs_review.eq.true")
    .order("year", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({
    total: count ?? 0,
    limit,
    offset,
    questions: (data ?? []).map((row) => ({
      ...row,
      taxonomy_topic_name: row.taxonomy_topic_id ? getSubtopicName(row.taxonomy_topic_id) : null,
    })),
  });
});

const ClassifyBody = z.object({
  taxonomy_topic_id: z.string().min(1),
});

/**
 * Override a question's taxonomy_topic_id.
 * PATCH /api/admin/physics/classify/:questionId
 */
router.patch("/admin/physics/classify/:questionId", requireAdmin, async (req, res): Promise<void> => {
  const questionId = Number(req.params.questionId);
  if (!Number.isFinite(questionId) || questionId <= 0) {
    res.status(400).json({ error: "Invalid questionId." }); return;
  }

  const parsed = ClassifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") }); return;
  }

  const { taxonomy_topic_id } = parsed.data;
  if (!isValidSubtopicId(taxonomy_topic_id)) {
    res.status(400).json({ error: `"${taxonomy_topic_id}" is not a valid taxonomy_topic_id.` }); return;
  }

  const { error } = await supabaseAdmin
    .from("question_index")
    .update({ taxonomy_topic_id, taxonomy_confidence: 1.0, needs_review: false })
    .eq("id", questionId);

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ ok: true, questionId, taxonomy_topic_id, name: getSubtopicName(taxonomy_topic_id) });
});

export default router;
