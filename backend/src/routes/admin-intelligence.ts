import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { isValidSubtopicId } from "../services/taxonomy-classifier";

const router: IRouter = Router();

/**
 * Retrieval quality dashboard.
 * GET /api/admin/intelligence/metrics?subject_code=0625&days=7
 */
router.get("/admin/intelligence/metrics", requireAdmin, async (req, res): Promise<void> => {
  const subjectCode = z.string().optional().parse(req.query.subject_code) ?? "0625";
  const days = Math.min(Math.max(Number(req.query.days ?? 7), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [telemetry, feedback] = await Promise.all([
    supabaseAdmin
      .from("ai_retrieval_telemetry")
      .select("retrieval_strategy,topic_method,resolved_topic_id,sources_returned,question_sources,top_similarity,provider_ok,latency_ms,legacy_sources_returned,legacy_sources_cited")
      .eq("subject_code", subjectCode)
      .gte("created_at", since)
      .limit(5000),
    supabaseAdmin
      .from("ai_answer_feedback")
      .select("rating,reason")
      .gte("created_at", since)
      .limit(5000),
  ]);

  if (telemetry.error) { res.status(500).json({ error: telemetry.error.message }); return; }
  if (feedback.error) { res.status(500).json({ error: feedback.error.message }); return; }

  const rows = telemetry.data ?? [];
  const total = rows.length;
  const tally = (key: string) => rows.reduce<Record<string, number>>((acc, r) => {
    const v = String((r as Record<string, unknown>)[key] ?? "unknown");
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});

  const topicResolved = rows.filter((r) => r.resolved_topic_id).length;
  const zeroSource = rows.filter((r) => (r.sources_returned ?? 0) === 0).length;
  const providerFailures = rows.filter((r) => r.provider_ok === false).length;
  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

  // Phase 1 (F1): evidence for retiring the legacy Gen-2 retrieval path.
  const legacyReturnedQueries = rows.filter((r) => (r.legacy_sources_returned ?? 0) > 0).length;
  const legacyCitedQueries = rows.filter((r) => (r.legacy_sources_cited ?? 0) > 0).length;

  const fb = feedback.data ?? [];
  const positive = fb.filter((f) => f.rating === 1).length;
  const negative = fb.filter((f) => f.rating === -1).length;

  res.json({
    subjectCode,
    windowDays: days,
    totalQueries: total,
    topicResolutionRate: total ? topicResolved / total : 0,
    zeroSourceRate: total ? zeroSource / total : 0,
    providerFailureRate: total ? providerFailures / total : 0,
    avgSourcesReturned: avg(rows.map((r) => r.sources_returned ?? 0)),
    avgLatencyMs: Math.round(avg(rows.map((r) => r.latency_ms ?? 0))),
    strategyBreakdown: tally("retrieval_strategy"),
    topicMethodBreakdown: tally("topic_method"),
    // "Is the legacy Gen-2 path safe to remove?" — if legacyCitationRate stays ~0
    // across real traffic, delete it. legacyReturnedRate shows wasted DB work.
    legacyRetrieval: {
      enabled: process.env.ENABLE_LEGACY_RETRIEVAL !== "false",
      queriesWhereLegacyReturned: legacyReturnedQueries,
      queriesWhereLegacyCited: legacyCitedQueries,
      legacyReturnedRate: total ? legacyReturnedQueries / total : 0,
      legacyCitationRate: total ? legacyCitedQueries / total : 0,
    },
    feedback: {
      total: fb.length,
      positive,
      negative,
      satisfactionRate: fb.length ? positive / fb.length : null,
      reasons: fb.reduce<Record<string, number>>((acc, f) => {
        if (f.reason) acc[f.reason] = (acc[f.reason] ?? 0) + 1;
        return acc;
      }, {}),
    },
  });
});

/** Recent offline eval runs. GET /api/admin/intelligence/eval-runs?subject_code=0625 */
router.get("/admin/intelligence/eval-runs", requireAdmin, async (req, res): Promise<void> => {
  const subjectCode = z.string().optional().parse(req.query.subject_code) ?? "0625";
  const { data, error } = await supabaseAdmin
    .from("retrieval_eval_run")
    .select("id,run_label,subject_code,total_cases,topic_accuracy,hit_at_3,hit_at_5,mrr,config,created_at")
    .eq("subject_code", subjectCode)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ runs: data ?? [] });
});

const EvalCaseBody = z.object({
  subject_code: z.string().min(1).default("0625"),
  query_text: z.string().trim().min(3).max(1000),
  expected_topic_id: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

/** Add a golden eval case. POST /api/admin/intelligence/eval-case */
router.post("/admin/intelligence/eval-case", requireAdmin, async (req, res): Promise<void> => {
  const parsed = EvalCaseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") }); return; }
  if (!isValidSubtopicId(parsed.data.expected_topic_id)) {
    res.status(400).json({ error: `"${parsed.data.expected_topic_id}" is not a valid taxonomy topic id.` }); return;
  }
  const { data, error } = await supabaseAdmin
    .from("retrieval_eval_case")
    .insert({ ...parsed.data, notes: parsed.data.notes ?? null })
    .select("id")
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, id: data?.id });
});

export default router;
