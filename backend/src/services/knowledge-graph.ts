/**
 * Knowledge Graph (Phase C).
 *
 * Materializes relationships as edges so common queries — "related questions",
 * "frequently tested concepts" — are graph lookups instead of per-request AI/vector
 * work. Related-question edges are built from the F18 question embeddings by reusing
 * each question's STORED vector (no re-embedding, no API cost).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RelatedQuestion = { questionId: number; weight: number };
export type TopicFrequency = { topicId: string; count: number };

/** Vector column may arrive as a pgvector string or a number[]; normalize to the RPC text form. */
function toVectorText(embedding: unknown): string | null {
  if (typeof embedding === "string") return embedding;
  if (Array.isArray(embedding)) return `[${embedding.join(",")}]`;
  return null;
}

/**
 * Build 'related_question' edges for a subject: each embedded question is linked
 * to its top-K nearest neighbours (cosine) via the stored embedding. Idempotent —
 * edges upsert on (edge_type, src_id, dst_id). Returns the number of edges written.
 */
export async function buildRelatedQuestionEdges(
  client: SupabaseClient,
  subjectId: number,
  opts: { neighbours?: number; threshold?: number; limit?: number; pageSize?: number } = {},
): Promise<number> {
  const neighbours = opts.neighbours ?? 6;
  const threshold = opts.threshold ?? 0.5;
  const maxRows = opts.limit ?? 100_000;
  const pageSize = opts.pageSize ?? 200;

  let processed = 0;
  let edgesWritten = 0;
  for (let offset = 0; processed < maxRows; offset += pageSize) {
    const { data, error } = await client
      .from("question_index")
      .select("id,embedding")
      .eq("subject_id", subjectId)
      .not("embedding", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const vector = toVectorText((row as { embedding: unknown }).embedding);
      if (!vector) continue;
      const { data: matches, error: rpcError } = await client.rpc("match_questions", {
        query_embedding: vector,
        match_subject_id: subjectId,
        match_count: neighbours + 1, // +1 because the row matches itself
        match_threshold: threshold,
        match_taxonomy_topic_id: null,
        match_taxonomy_prefix: null,
      });
      if (rpcError) continue;
      const edges = (matches ?? [])
        .filter((m: { id: number }) => m.id !== row.id)
        .slice(0, neighbours)
        .map((m: { id: number; similarity: number }) => ({
          subject_id: subjectId,
          edge_type: "related_question",
          src_type: "question",
          src_id: String(row.id),
          dst_type: "question",
          dst_id: String(m.id),
          weight: m.similarity,
        }));
      if (edges.length) {
        const { error: upErr } = await client.from("knowledge_edges").upsert(edges, { onConflict: "edge_type,src_id,dst_id" });
        if (!upErr) edgesWritten += edges.length;
      }
    }
    processed += rows.length;
    if (rows.length < pageSize) break;
  }
  return edgesWritten;
}

/** Read the related questions for one question (graph lookup, no vector math). */
export async function getRelatedQuestions(client: SupabaseClient, questionId: number, limit = 6): Promise<RelatedQuestion[]> {
  const { data, error } = await client
    .from("knowledge_edges")
    .select("dst_id,weight")
    .eq("edge_type", "related_question")
    .eq("src_id", String(questionId))
    .order("weight", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((e) => ({ questionId: Number(e.dst_id), weight: Number(e.weight ?? 0) }));
}

/**
 * Frequently tested concepts for a subject: taxonomy topic counts over the eligible
 * question corpus, most-tested first. Deterministic aggregation, no AI.
 */
export async function getFrequentlyTestedTopics(client: SupabaseClient, subjectId: number, limit = 15): Promise<TopicFrequency[]> {
  const counts = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("question_index")
      .select("taxonomy_topic_id")
      .eq("subject_id", subjectId)
      .not("taxonomy_topic_id", "is", null)
      .in("text_quality_status", ["good", "acceptable"])
      .range(offset, offset + 999);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      const id = r.taxonomy_topic_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (rows.length < 1000) break;
  }
  return [...counts.entries()]
    .map(([topicId, count]) => ({ topicId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
