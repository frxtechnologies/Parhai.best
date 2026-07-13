/**
 * Visibility-tiered grounding (KC-3) — the enforcement layer that makes
 * "students must NEVER view or download AI-only/training-only resources, but
 * the AI may use them" actually true end-to-end, not just at the RLS layer.
 *
 * Visibility is four independent permissions (migration 20260711000001):
 * visible_to_students / visible_to_ai / visible_to_training / visible_to_admin.
 * RLS already makes visible_to_students=false resources/chunks invisible to the
 * regular authenticated role — a student-scoped client can never read them,
 * full stop. This module supplies the ONE sanctioned path for the AI to still
 * ground answers in non-student-visible content: a service-role query, used
 * only server-side, whose results are (a) never returned to the client with
 * any identifying/downloadable reference and (b) subject to an explicit
 * "paraphrase, never quote" prompt rule.
 *
 * visible_to_training is deliberately NEVER queried here — per spec that flag
 * exists only for the Phase D dataset builder, not for live answer grounding.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PrivateGroundingSource = {
  sourceType: "resource";
  id: string;
  content: string;
  visibilityTier: "ai_private";
  metadata: Record<string, unknown>;
};

/**
 * Fetch AI-usable-but-not-student-visible chunks for grounding via the service
 * role. Keyword-matched (cheap, no extra embedding call) against the same
 * expanded terms the public retrieval path already computed.
 */
export async function fetchPrivateGroundingChunks(
  adminClient: SupabaseClient,
  subjectId: number,
  terms: string[],
  limit = 6,
): Promise<PrivateGroundingSource[]> {
  if (terms.length === 0) return [];
  const query = adminClient
    .from("ai_chunks")
    .select("id,content,resources!inner(id,resource_type,visible_to_ai,visible_to_students,is_approved,title)")
    .eq("subject_id", subjectId)
    .eq("resources.visible_to_ai", true)
    .eq("resources.visible_to_students", false)
    .eq("resources.is_approved", true)
    .or(terms.slice(0, 3).map((t) => `content.ilike.%${t}%`).join(","));
  const { data, error } = await query.limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({
    sourceType: "resource" as const,
    id: `private-${row.id}`,
    content: String(row.content ?? "").slice(0, 3000),
    visibilityTier: "ai_private" as const,
    metadata: { resourceType: (Array.isArray(row.resources) ? row.resources[0] : row.resources)?.resource_type },
  }));
}

export type GoldAnswerSource = {
  sourceType: "gold_answer";
  id: string;
  content: string;
  metadata: Record<string, unknown>;
};

/**
 * Fetch prior teacher-verified / strongly-positive answers from the Interaction
 * Ledger (Phase A/B) as top-priority grounding — Parhai reusing its OWN verified
 * reasoning before reaching for raw papers. Topic-scoped when a topic resolved.
 */
export async function fetchGoldAnswers(
  adminClient: SupabaseClient,
  subjectId: number,
  topicId: string | null,
  limit = 3,
): Promise<GoldAnswerSource[]> {
  let query = adminClient
    .from("ai_interaction_ledger")
    .select("id,query_text,answer_text,resolved_topic_id")
    .eq("subject_id", subjectId)
    .in("verification_status", ["teacher_verified", "student_positive"])
    .not("answer_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit * 3); // over-fetch, then topic-filter in app code (small volumes)
  if (topicId) query = query.eq("resolved_topic_id", topicId);
  const { data, error } = await query.limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({
    sourceType: "gold_answer" as const,
    id: `gold-${row.id}`,
    content: `Verified prior answer: ${row.answer_text}`.slice(0, 3000),
    metadata: { ledgerId: row.id },
  }));
}

/** Appended to the system prompt whenever any non-PUBLIC source is in context. */
export const PRIVATE_SOURCE_PROMPT_RULE =
  "Some evidence above is marked as PRIVATE teaching material. You may use it to inform and ground your " +
  "explanation, but you must PARAPHRASE and EXPLAIN it in your own words — never quote it verbatim, never reveal " +
  "that it comes from a specific private file, and keep any reproduction brief and transformative (a short " +
  "definition or formula is fine; multi-sentence verbatim copying is not).";

/**
 * Strip any identifying or downloadable reference from a source before it is
 * returned to a student. Called on every source in the final response payload.
 */
export function sanitizeSourceForStudent<T extends { visibilityTier?: string; filePath?: unknown; screenshotUrl?: unknown; sourceFile?: unknown; reference?: string }>(
  source: T,
): T {
  if (!source.visibilityTier || source.visibilityTier === "public") return source;
  return {
    ...source,
    filePath: null,
    screenshotUrl: null,
    sourceFile: null,
    reference: "Verified Parhai teaching material",
  };
}
