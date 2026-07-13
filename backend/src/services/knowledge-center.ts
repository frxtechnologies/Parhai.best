/**
 * AI Knowledge Center — resource-level post-processing (the "brain" wiring).
 *
 * Runs after a resource has been extracted/chunked/embedded (resource-processor.ts
 * handles that, question-level). This layer does the RESOURCE-level linking the
 * Knowledge Center promises: classify its topic, link it to related questions,
 * write it into the knowledge graph, and — where appropriate — derive a
 * deterministic training candidate. Best-effort throughout: a linking failure
 * must never fail the underlying ingestion that already succeeded.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyQueryTopicId, keywordClassifyTopicId, hasTaxonomy } from "./taxonomy-classifier";
import { contentHash } from "./dataset-builder";

export type LinkableResource = {
  id: number;
  subject_id: number;
  resource_type: string;
  title: string;
  extracted_text: string | null;
  visible_to_students: boolean;
  visible_to_ai: boolean;
  visible_to_training: boolean;
  is_approved: boolean;
};

const NOTE_LIKE_TYPES = new Set(["TEACHER_NOTES", "AI_NOTES", "FORMULA_SHEET", "BOOK", "FLASHCARDS", "PRIVATE_GUIDE", "NOTES"]);
const RELATED_QUESTION_LIMIT = 8;
const MIN_TEXT_FOR_CLASSIFICATION = 80;
const MIN_TEXT_FOR_TRAINING_CANDIDATE = 200;

/**
 * Classify the resource's topic (local model first, API fallback — see
 * taxonomy-classifier.ts) and persist it. Returns the resolved topic id, or null
 * if the subject has no taxonomy or there's not enough text to classify.
 */
export async function classifyResourceTopic(
  client: SupabaseClient,
  resource: LinkableResource,
  subjectCode: string,
): Promise<{ topicId: string | null; confidence: number }> {
  if (!hasTaxonomy(subjectCode)) return { topicId: null, confidence: 0 };
  const text = `${resource.title}\n${(resource.extracted_text ?? "").slice(0, 1500)}`.trim();
  if (text.length < MIN_TEXT_FOR_CLASSIFICATION) return { topicId: null, confidence: 0 };

  const classified = await classifyQueryTopicId(text, subjectCode).catch(() => ({ topicId: null, method: "none" as const }));
  const topicId = classified.topicId ?? keywordClassifyTopicId(text, subjectCode);
  const confidence = classified.method === "api" ? 0.85 : classified.method === "local" ? 0.75 : topicId ? 0.5 : 0;
  if (!topicId) return { topicId: null, confidence: 0 };

  await client.from("resources").update({ taxonomy_topic_id: topicId, confidence_score: confidence }).eq("id", resource.id);
  return { topicId, confidence };
}

/** Write resource -> topic and resource -> related-question edges into the knowledge graph. */
export async function linkResourceIntoGraph(
  client: SupabaseClient,
  resource: LinkableResource,
  topicId: string,
): Promise<{ topicEdge: boolean; relatedQuestions: number }> {
  const topicEdge = await client.from("knowledge_edges").upsert(
    { subject_id: resource.subject_id, edge_type: "resource_topic", src_type: "resource", src_id: String(resource.id), dst_type: "topic", dst_id: topicId, weight: 1 },
    { onConflict: "edge_type,src_id,dst_id" },
  );

  const { data: questions } = await client
    .from("question_index")
    .select("id")
    .eq("subject_id", resource.subject_id)
    .eq("taxonomy_topic_id", topicId)
    .in("text_quality_status", ["good", "acceptable"])
    .limit(RELATED_QUESTION_LIMIT);
  const rows = (questions ?? []).map((q) => ({
    subject_id: resource.subject_id, edge_type: "resource_related_question",
    src_type: "resource", src_id: String(resource.id), dst_type: "question", dst_id: String(q.id), weight: 0.7,
  }));
  if (rows.length) await client.from("knowledge_edges").upsert(rows, { onConflict: "edge_type,src_id,dst_id" });

  return { topicEdge: !topicEdge.error, relatedQuestions: rows.length };
}

/**
 * Derive a deterministic training candidate from a note-like resource (never an
 * LLM call — the resource's own extracted text IS the training signal). Held in
 * a rolling 'candidates' pool, separate from versioned dataset builds (Phase D),
 * since these are unverified until a human/teacher review promotes them.
 */
export async function deriveTrainingCandidate(
  client: SupabaseClient,
  resource: LinkableResource,
  subjectCode: string,
  topicId: string | null,
): Promise<boolean> {
  if (!NOTE_LIKE_TYPES.has(resource.resource_type)) return false;
  if (!resource.visible_to_training) return false; // this resource opted out of training use
  const text = (resource.extracted_text ?? "").trim();
  if (text.length < MIN_TEXT_FOR_TRAINING_CANDIDATE) return false;

  const output = text.slice(0, 4000);
  const hash = contentHash("kc", String(resource.id), output);
  const { error } = await client.from("training_examples").upsert({
    dataset_version: "candidates",
    source: "knowledge_resource",
    subject_code: subjectCode,
    topic_id: topicId,
    difficulty: null,
    marks: null,
    instruction: "Explain this Cambridge teaching resource clearly to a student.",
    input: resource.title,
    output,
    metadata: { resourceId: resource.id, resourceType: resource.resource_type, visibleToStudents: resource.visible_to_students },
    content_hash: hash,
  }, { onConflict: "dataset_version,content_hash", ignoreDuplicates: true });
  return !error;
}

/**
 * Run the full Knowledge Center post-processing pass for one resource. Never
 * throws — every step is independently best-effort so a partial failure doesn't
 * undo the ingestion that already succeeded.
 */
export async function runKnowledgeCenterPostProcessing(
  client: SupabaseClient,
  resource: LinkableResource,
  subjectCode: string,
): Promise<{ topicId: string | null; graphEdges: number; trainingCandidate: boolean }> {
  try {
    const { topicId } = await classifyResourceTopic(client, resource, subjectCode);
    if (!topicId) return { topicId: null, graphEdges: 0, trainingCandidate: false };
    const graph = await linkResourceIntoGraph(client, resource, topicId);
    const trainingCandidate = await deriveTrainingCandidate(client, resource, subjectCode, topicId).catch(() => false);
    return { topicId, graphEdges: (graph.topicEdge ? 1 : 0) + graph.relatedQuestions, trainingCandidate };
  } catch {
    return { topicId: null, graphEdges: 0, trainingCandidate: false };
  }
}
