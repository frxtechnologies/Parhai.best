/**
 * Interaction Ledger (Phase A) — Parhai's data flywheel.
 *
 * Records the full (input → grounded evidence → output) tuple for every answered
 * query, tagged with model provenance, as a future training candidate. Writes are
 * best-effort and MUST NEVER break or slow the user response: failures are
 * swallowed. Returns the new row id so the client can attach feedback to it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** One retrieved source, compacted for the ledger (avoids storing 5k-char blobs). */
export type LedgerEvidence = {
  sourceType: string;
  id: number | string | null;
  reference: string;
  similarity?: number | null;
  questionNumber?: string | null;
  topic?: string | null;
};

export type InteractionRecord = {
  userId: string;
  subjectId: number;
  subjectCode: string;
  mode: string;
  modelProvider: string;
  modelName: string;
  queryText: string;
  resolvedTopicId: string | null;
  retrievalStrategy: string;
  evidence: LedgerEvidence[];
  answerText: string;
  citations: string[];
  answerLength: string;
  latencyMs: number;
};

export async function logInteraction(client: SupabaseClient, record: InteractionRecord): Promise<number | null> {
  try {
    const { data, error } = await client
      .from("ai_interaction_ledger")
      .insert({
        user_id: record.userId,
        subject_id: record.subjectId,
        subject_code: record.subjectCode,
        mode: record.mode,
        model_provider: record.modelProvider,
        model_name: record.modelName,
        query_text: record.queryText.slice(0, 4000),
        resolved_topic_id: record.resolvedTopicId,
        retrieval_strategy: record.retrievalStrategy,
        evidence: record.evidence.slice(0, 12),
        answer_text: record.answerText.slice(0, 12000),
        citations: record.citations.slice(0, 24),
        answer_length: record.answerLength,
        latency_ms: record.latencyMs,
      })
      .select("id")
      .single();
    if (error) return null;
    return (data?.id as number) ?? null;
  } catch {
    return null;
  }
}

/** Update a ledger row's verification from student feedback (own rows only, via RLS). */
export async function recordLedgerVerification(
  client: SupabaseClient,
  ledgerId: number,
  status: "student_positive" | "student_negative",
): Promise<void> {
  try {
    await client.from("ai_interaction_ledger").update({ verification_status: status }).eq("id", ledgerId);
  } catch {
    // Best-effort; never block the feedback response.
  }
}
