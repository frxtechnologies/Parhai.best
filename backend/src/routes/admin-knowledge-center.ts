import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

/**
 * The Knowledge Center dashboard — a single call that answers "what state is
 * the brain in?": processing/embedding coverage, graph size, retrieval
 * coverage per subject, dataset growth, failed jobs, and AI usage. Every number
 * here is a real aggregate query, not a cached/estimated figure.
 */
router.get("/admin/knowledge-center/dashboard", requireAdmin, async (req, res): Promise<void> => {
  const days = Math.min(Math.max(Number(req.query.days ?? 14), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [
    processingStatus,
    failedJobs,
    resourceCounts,
    graphEdgeCount,
    graphEdgeTypes,
    trainingByVersion,
    trainingBySource,
    telemetryRows,
    subjectCounts,
    embeddedCounts,
    classifiedCounts,
  ] = await Promise.all([
    supabaseAdmin.from("knowledge_center_processing_status").select("*"),
    supabaseAdmin.from("knowledge_center_failed_jobs").select("*").limit(50),
    supabaseAdmin.from("resources").select("resource_type,visibility,is_approved", { count: "exact", head: false }).limit(50000),
    supabaseAdmin.from("knowledge_edges").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("knowledge_edges").select("edge_type").limit(50000),
    supabaseAdmin.from("training_examples").select("dataset_version,created_at").gte("created_at", since).limit(50000),
    supabaseAdmin.from("training_examples").select("source", { count: "exact", head: false }).limit(50000),
    supabaseAdmin.from("ai_retrieval_telemetry").select("retrieval_strategy,provider_ok,latency_ms").gte("created_at", since).limit(20000),
    supabaseAdmin.from("question_index").select("subject_id", { count: "exact", head: false }).limit(50000),
    supabaseAdmin.from("question_index").select("subject_id").not("embedding", "is", null).limit(50000),
    supabaseAdmin.from("question_index").select("subject_id").not("taxonomy_topic_id", "is", null).limit(50000),
  ]);

  const tally = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T) =>
    (rows ?? []).reduce<Record<string, number>>((acc, r) => {
      const v = String(r[key] ?? "unknown");
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});

  const byDay = (rows: { created_at: string }[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((acc, r) => {
      const day = r.created_at.slice(0, 10);
      acc[day] = (acc[day] ?? 0) + 1;
      return acc;
    }, {});

  const totalQuestions = resourceCounts.count ?? 0;
  const coverageBySubject = (() => {
    const total = tally(subjectCounts.data, "subject_id");
    const embedded = tally(embeddedCounts.data, "subject_id");
    const classified = tally(classifiedCounts.data, "subject_id");
    return Object.keys(total).map((subjectId) => ({
      subjectId,
      totalQuestions: total[subjectId] ?? 0,
      embedded: embedded[subjectId] ?? 0,
      classified: classified[subjectId] ?? 0,
      embeddedRate: total[subjectId] ? (embedded[subjectId] ?? 0) / total[subjectId]! : 0,
      classifiedRate: total[subjectId] ? (classified[subjectId] ?? 0) / total[subjectId]! : 0,
    }));
  })();

  const telemetry = telemetryRows.data ?? [];
  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

  res.json({
    windowDays: days,
    processingStatus: processingStatus.data ?? [],
    failedJobs: failedJobs.data ?? [],
    resources: {
      total: totalQuestions,
      byType: tally(resourceCounts.data, "resource_type"),
      byVisibility: tally(resourceCounts.data, "visibility"),
      approvedCount: (resourceCounts.data ?? []).filter((r) => r.is_approved).length,
    },
    knowledgeGraph: {
      totalEdges: graphEdgeCount.count ?? 0,
      byEdgeType: tally(graphEdgeTypes.data, "edge_type"),
    },
    retrievalCoverage: coverageBySubject,
    datasetGrowth: {
      byDay: byDay(trainingByVersion.data),
      byVersion: tally(trainingByVersion.data, "dataset_version"),
      bySource: tally(trainingBySource.data, "source"),
      totalRecentExamples: trainingByVersion.data?.length ?? 0,
    },
    aiUsage: {
      totalQueries: telemetry.length,
      strategyBreakdown: tally(telemetry, "retrieval_strategy"),
      providerFailureRate: telemetry.length ? telemetry.filter((t) => t.provider_ok === false).length / telemetry.length : 0,
      avgLatencyMs: Math.round(avg(telemetry.map((t) => t.latency_ms ?? 0))),
    },
  });
});

const UpdateResourceBody = z.object({
  visibility: z.enum(["PUBLIC", "AI_PRIVATE", "TRAINING_ONLY", "ADMIN_ONLY"]).optional(),
  taxonomy_topic_id: z.string().nullable().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  confidence_score: z.number().min(0).max(1).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field is required." });

/** Update a resource's Knowledge Center metadata (visibility, topic, difficulty, source, confidence). */
router.patch("/admin/knowledge-center/resources/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }
  const parsed = UpdateResourceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") }); return; }

  const { error } = await supabaseAdmin.from("resources").update(parsed.data).eq("id", id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, id, updated: parsed.data });
});

/** List resources with the full Knowledge Center field set (admin view — all visibility tiers). */
router.get("/admin/knowledge-center/resources", requireAdmin, async (req, res): Promise<void> => {
  const subjectId = req.query.subject_id ? Number(req.query.subject_id) : undefined;
  const resourceType = z.string().optional().parse(req.query.resource_type);
  const visibility = z.string().optional().parse(req.query.visibility);
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  let query = supabaseAdmin
    .from("resources")
    .select("id,title,resource_type,visibility,is_approved,processing_status,year,session,paper_code,variant,taxonomy_topic_id,difficulty,source,confidence_score,subject_id,created_at,subjects(name,code)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (subjectId) query = query.eq("subject_id", subjectId);
  if (resourceType) query = query.eq("resource_type", resourceType);
  if (visibility) query = query.eq("visibility", visibility);

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ total: count ?? 0, limit, offset, resources: data ?? [] });
});

export default router;
