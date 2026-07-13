/**
 * Retrieval telemetry — records HOW each RAG query was resolved so retrieval
 * quality is observable. Writes are best-effort and MUST NEVER break the user
 * request path: every failure is swallowed and logged, never thrown.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RetrievalTelemetry = {
  userId: string;
  subjectId: number;
  subjectCode: string;
  queryText: string;
  mode: string;
  resolvedTopicId: string | null;
  topicMethod: "local" | "api" | "keyword" | "none";
  retrievalStrategy: string;
  sourcesReturned: number;
  questionSources: number;
  topSimilarity: number | null;
  answerLength: string;
  providerOk: boolean;
  latencyMs: number;
  legacySourcesReturned: number;
  legacySourcesCited: number;
};

/**
 * Insert one telemetry row. Returns the new row id (for linking feedback), or
 * null on any failure. Uses the caller's user-scoped client so RLS applies.
 */
export async function logRetrievalTelemetry(
  client: SupabaseClient,
  t: RetrievalTelemetry,
): Promise<number | null> {
  try {
    const { data, error } = await client
      .from("ai_retrieval_telemetry")
      .insert({
        user_id: t.userId,
        subject_id: t.subjectId,
        subject_code: t.subjectCode,
        query_text: t.queryText.slice(0, 4000),
        mode: t.mode,
        resolved_topic_id: t.resolvedTopicId,
        topic_method: t.topicMethod,
        retrieval_strategy: t.retrievalStrategy,
        sources_returned: t.sourcesReturned,
        question_sources: t.questionSources,
        top_similarity: t.topSimilarity,
        answer_length: t.answerLength,
        provider_ok: t.providerOk,
        latency_ms: t.latencyMs,
        legacy_sources_returned: t.legacySourcesReturned,
        legacy_sources_cited: t.legacySourcesCited,
      })
      .select("id")
      .single();
    if (error) return null;
    return (data?.id as number) ?? null;
  } catch {
    return null;
  }
}
