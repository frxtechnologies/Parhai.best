import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { isGoldReady } from "../services/gold-promotion";

const router: IRouter = Router();

/**
 * Teacher review queue — training candidates awaiting a verification decision.
 * GET /api/admin/ledger/review-queue?subject_code=0625&status=unverified&limit=50
 * Default returns rows that a human should look at (unverified + student-flagged),
 * newest first, ordered by capture-time quality so the best candidates surface.
 */
router.get("/admin/ledger/review-queue", requireAdmin, async (req, res): Promise<void> => {
  const subjectCode = z.string().optional().parse(req.query.subject_code);
  const status = z.string().optional().parse(req.query.status);
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  let query = supabaseAdmin
    .from("ai_interaction_ledger")
    .select("id,created_at,subject_code,mode,model_provider,model_name,query_text,resolved_topic_id,retrieval_strategy,answer_text,citations,quality_score,verification_status", { count: "exact" })
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (subjectCode) query = query.eq("subject_code", subjectCode);
  query = status ? query.eq("verification_status", status) : query.in("verification_status", ["unverified", "student_positive", "student_negative"]);

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ total: count ?? 0, limit, offset, candidates: data ?? [] });
});

const VerifyBody = z.object({
  status: z.enum(["teacher_verified", "rejected"]),
  quality_score: z.number().min(0).max(1).optional(),
});

/**
 * Teacher verification decision (gold promotion / rejection).
 * PATCH /api/admin/ledger/:id/verify  { status, quality_score? }
 */
router.patch("/admin/ledger/:id/verify", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid ledger id." }); return; }
  const parsed = VerifyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") }); return; }

  const update: Record<string, unknown> = {
    verification_status: parsed.data.status,
    verified_by: (res.locals.user?.id as string | undefined) ?? null,
    verified_at: new Date().toISOString(),
  };
  if (parsed.data.quality_score !== undefined) update.quality_score = parsed.data.quality_score;
  // A rejected candidate is excluded from the training set.
  if (parsed.data.status === "rejected") update.training_export_status = "excluded";

  const { error } = await supabaseAdmin.from("ai_interaction_ledger").update(update).eq("id", id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, id, status: parsed.data.status });
});

/**
 * Gold-corpus summary — how much training-grade data has accumulated.
 * GET /api/admin/ledger/gold-stats?subject_code=0625
 */
router.get("/admin/ledger/gold-stats", requireAdmin, async (req, res): Promise<void> => {
  const subjectCode = z.string().optional().parse(req.query.subject_code);
  let query = supabaseAdmin
    .from("ai_interaction_ledger")
    .select("verification_status,quality_score,training_export_status")
    .limit(50000);
  if (subjectCode) query = query.eq("subject_code", subjectCode);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  const rows = data ?? [];
  const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
    const v = String(r.verification_status ?? "unknown");
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
  const goldReady = rows.filter(isGoldReady).length;
  const pendingExport = rows.filter((r) => isGoldReady(r) && r.training_export_status === "pending").length;

  res.json({
    subjectCode: subjectCode ?? "all",
    total: rows.length,
    goldReady,
    pendingExport,
    verificationBreakdown: byStatus,
  });
});

export default router;
