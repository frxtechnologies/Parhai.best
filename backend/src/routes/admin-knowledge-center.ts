import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { parseCambridgeFilenames } from "../services/cambridge-filename-parser";

const router: IRouter = Router();

/** The Knowledge Library collection tree (fixed hierarchy, seeded in the DB). */
router.get("/admin/knowledge-center/collections", requireAdmin, async (_req, res): Promise<void> => {
  const { data, error } = await supabaseAdmin.from("knowledge_collections").select("id,key,parent_key,name,icon,sort_order").order("sort_order");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ collections: data ?? [] });
});

const DetectBody = z.object({ filenames: z.array(z.string()).min(1).max(2000) });

/**
 * Bulk metadata auto-detection for the upload queue — the "never ask
 * unnecessary information" endpoint. Parses each filename against the
 * Cambridge naming convention (deterministic, no AI cost) and resolves the
 * detected syllabus code to a real subject_id in one batched query.
 */
router.post("/admin/knowledge-center/detect", requireAdmin, async (req, res): Promise<void> => {
  const parsed = DetectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") }); return; }

  const matches = parseCambridgeFilenames(parsed.data.filenames);
  const codes = [...new Set(matches.filter((m): m is NonNullable<typeof m> => m !== null).map((m) => m.syllabusCode))];
  const { data: subjects } = codes.length
    ? await supabaseAdmin.from("subjects").select("id,code,name,level").in("code", codes)
    : { data: [] };
  const subjectByCode = new Map((subjects ?? []).map((s) => [s.code, s]));

  res.json({
    results: parsed.data.filenames.map((filename, i) => {
      const m = matches[i];
      if (!m) return { filename, matched: false };
      const subject = subjectByCode.get(m.syllabusCode);
      return {
        filename, matched: true, resourceType: m.resourceType, year: m.year, session: m.session,
        paperNumber: m.paperNumber, variant: m.variant, confidence: m.confidence,
        subject: subject ? { id: subject.id, name: subject.name, code: subject.code, level: subject.level } : null,
      };
    }),
  });
});

/**
 * The Knowledge Library dashboard — a single call answering "what state is the
 * brain in?": processing/embedding coverage, graph size, retrieval coverage per
 * subject, dataset growth, failed jobs, AI usage, and (new) local-model /
 * gold-dataset summary. Every number is a real aggregate query.
 */
router.get("/admin/knowledge-center/dashboard", requireAdmin, async (req, res): Promise<void> => {
  const days = Math.min(Math.max(Number(req.query.days ?? 14), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [
    processingStatus, failedJobs, resourceCounts, graphEdgeCount, graphEdgeTypes,
    trainingByVersion, trainingBySource, telemetryRows, subjectCounts, embeddedCounts,
    classifiedCounts, activeModels, needsReviewCount,
  ] = await Promise.all([
    supabaseAdmin.from("knowledge_center_processing_status").select("*"),
    supabaseAdmin.from("knowledge_center_failed_jobs").select("*").limit(50),
    supabaseAdmin.from("resources").select("resource_type,visible_to_students,visible_to_ai,visible_to_training,is_approved,collection_id", { count: "exact", head: false }).limit(50000),
    supabaseAdmin.from("knowledge_edges").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("knowledge_edges").select("edge_type").limit(50000),
    supabaseAdmin.from("training_examples").select("dataset_version,created_at").gte("created_at", since).limit(50000),
    supabaseAdmin.from("training_examples").select("source", { count: "exact", head: false }).limit(50000),
    supabaseAdmin.from("ai_retrieval_telemetry").select("retrieval_strategy,provider_ok,latency_ms").gte("created_at", since).limit(20000),
    supabaseAdmin.from("question_index").select("subject_id", { count: "exact", head: false }).limit(50000),
    supabaseAdmin.from("question_index").select("subject_id").not("embedding", "is", null).limit(50000),
    supabaseAdmin.from("question_index").select("subject_id").not("taxonomy_topic_id", "is", null).limit(50000),
    supabaseAdmin.from("model_registry").select("model_key,version,metrics,activated_at").eq("status", "active"),
    supabaseAdmin.from("question_index").select("id", { count: "exact", head: true }).eq("needs_review", true),
  ]);

  const tally = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T) =>
    (rows ?? []).reduce<Record<string, number>>((acc, r) => {
      const v = String(r[key] ?? "unknown");
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
  const byDay = (rows: { created_at: string }[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((acc, r) => { const d = r.created_at.slice(0, 10); acc[d] = (acc[d] ?? 0) + 1; return acc; }, {});

  const total = resourceCounts.count ?? 0;
  const rows = resourceCounts.data ?? [];
  const coverageBySubject = (() => {
    const totalQ = tally(subjectCounts.data, "subject_id");
    const embedded = tally(embeddedCounts.data, "subject_id");
    const classified = tally(classifiedCounts.data, "subject_id");
    return Object.keys(totalQ).map((subjectId) => ({
      subjectId, totalQuestions: totalQ[subjectId] ?? 0, embedded: embedded[subjectId] ?? 0, classified: classified[subjectId] ?? 0,
      embeddedRate: totalQ[subjectId] ? (embedded[subjectId] ?? 0) / totalQ[subjectId]! : 0,
      classifiedRate: totalQ[subjectId] ? (classified[subjectId] ?? 0) / totalQ[subjectId]! : 0,
    }));
  })();

  const telemetry = telemetryRows.data ?? [];
  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

  res.json({
    windowDays: days,
    processingStatus: processingStatus.data ?? [],
    failedJobs: failedJobs.data ?? [],
    resources: {
      total,
      byType: tally(rows, "resource_type"),
      byCollection: tally(rows, "collection_id"),
      approvedCount: rows.filter((r) => r.is_approved).length,
      studentVisibleCount: rows.filter((r) => r.visible_to_students).length,
      aiOnlyCount: rows.filter((r) => r.visible_to_ai && !r.visible_to_students).length,
    },
    knowledgeGraph: { totalEdges: graphEdgeCount.count ?? 0, byEdgeType: tally(graphEdgeTypes.data, "edge_type") },
    retrievalCoverage: coverageBySubject,
    datasetGrowth: {
      byDay: byDay(trainingByVersion.data), byVersion: tally(trainingByVersion.data, "dataset_version"),
      bySource: tally(trainingBySource.data, "source"), totalRecentExamples: trainingByVersion.data?.length ?? 0,
    },
    aiUsage: {
      totalQueries: telemetry.length, strategyBreakdown: tally(telemetry, "retrieval_strategy"),
      providerFailureRate: telemetry.length ? telemetry.filter((t) => t.provider_ok === false).length / telemetry.length : 0,
      avgLatencyMs: Math.round(avg(telemetry.map((t) => t.latency_ms ?? 0))),
    },
    aiModels: {
      active: (activeModels.data ?? []).map((m) => ({ modelKey: m.model_key, version: m.version, accuracy: (m.metrics as { accuracy?: number })?.accuracy ?? null, activatedAt: m.activated_at })),
    },
    needsVerification: { questionsNeedingReview: needsReviewCount.count ?? 0 },
  });
});

const UpdateResourceBody = z.object({
  visible_to_students: z.boolean().optional(),
  visible_to_ai: z.boolean().optional(),
  visible_to_training: z.boolean().optional(),
  visible_to_admin: z.boolean().optional(),
  collection_id: z.number().int().positive().nullable().optional(),
  taxonomy_topic_id: z.string().nullable().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  confidence_score: z.number().min(0).max(1).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field is required." });

/** Update a resource's Knowledge Library metadata. */
router.patch("/admin/knowledge-center/resources/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }
  const parsed = UpdateResourceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") }); return; }

  const { error } = await supabaseAdmin.from("resources").update(parsed.data).eq("id", id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true, id, updated: parsed.data });
});

/** List resources with the full field set + search/filter — every visibility tier (admin view). */
router.get("/admin/knowledge-center/resources", requireAdmin, async (req, res): Promise<void> => {
  const subjectId = req.query.subject_id ? Number(req.query.subject_id) : undefined;
  const collectionId = req.query.collection_id ? Number(req.query.collection_id) : undefined;
  const resourceType = z.string().optional().parse(req.query.resource_type);
  const search = z.string().optional().parse(req.query.q);
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  let query = supabaseAdmin
    .from("resources")
    .select("id,title,resource_type,collection_id,visible_to_students,visible_to_ai,visible_to_training,visible_to_admin,is_approved,processing_status,year,session,paper_code,variant,taxonomy_topic_id,difficulty,source,confidence_score,subject_id,created_at,subjects(name,code)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (subjectId) query = query.eq("subject_id", subjectId);
  if (collectionId) query = query.eq("collection_id", collectionId);
  if (resourceType) query = query.eq("resource_type", resourceType);
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ total: count ?? 0, limit, offset, resources: data ?? [] });
});

export default router;
