/**
 * Physics 0625 topic classifier.
 * Uses a CLOSED-SET AI prompt — the model can only pick from the fixed taxonomy.
 * Called at ingestion time (batch script) and query time (per-request fallback).
 */

import { generateAiJson, isAiConfigured } from "../lib/ai-service";
import { PHYSICS_0625_TAXONOMY, type TaxonomyTopic } from "../data/physics-taxonomy";

export type { TaxonomyTopic };

const SUBTOPICS = PHYSICS_0625_TAXONOMY.filter((t) => t.level === 2);
const VALID_SUBTOPIC_IDS = new Set<string>(SUBTOPICS.map((t) => t.id));

const CONFIDENCE_THRESHOLD = Number(process.env.TAXONOMY_CONFIDENCE_THRESHOLD ?? "0.75");

export function getAllTaxonomyTopics(): TaxonomyTopic[] {
  return PHYSICS_0625_TAXONOMY;
}

export function isValidSubtopicId(id: string): boolean {
  return VALID_SUBTOPIC_IDS.has(id);
}

/** Return the level-1 parent ID, e.g. "phys.motion.forces" → "phys.motion" */
export function parentTopicId(subtopicId: string): string | null {
  return PHYSICS_0625_TAXONOMY.find((t) => t.id === subtopicId)?.parent_id ?? null;
}

export function getSubtopicName(id: string): string | null {
  return PHYSICS_0625_TAXONOMY.find((t) => t.id === id)?.name ?? null;
}

function buildChoiceList(): string {
  return SUBTOPICS.map((t) => {
    const parent = PHYSICS_0625_TAXONOMY.find((p) => p.id === t.parent_id);
    return `${t.id}  →  ${parent?.name ?? ""} > ${t.name}`;
  }).join("\n");
}

type ClassifyResult = {
  topic_id: string | null;
  confidence: number;
  needs_review: boolean;
};

async function callAI(text: string): Promise<ClassifyResult> {
  const system = `You are a Cambridge IGCSE Physics (0625) topic classifier.
Pick exactly ONE topic_id from this list. Output ONLY valid JSON.

RULES:
1. topic_id must be exactly one of the IDs listed below.
2. confidence is a float 0.0–1.0 (how certain you are).
3. Never invent an id that is not in the list.
4. Output format: {"topic_id": "<id>", "confidence": <number>}

VALID IDS:
${buildChoiceList()}`;

  const user = `Classify this Cambridge IGCSE Physics question:\n\n${text.slice(0, 1400)}`;
  const raw = await generateAiJson(system, user);

  let parsed: { topic_id?: unknown; confidence?: unknown };
  try {
    const clean = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return { topic_id: null, confidence: 0, needs_review: true };
  }

  const id = typeof parsed.topic_id === "string" ? parsed.topic_id.trim() : null;
  const confidence = typeof parsed.confidence === "number"
    ? Math.min(1, Math.max(0, parsed.confidence))
    : 0;

  return { topic_id: id, confidence, needs_review: false };
}

/**
 * Classify a question at ingestion / batch time.
 * Retries once on hallucination, then marks needs_review=true.
 */
export async function classifyQuestionTopicId(questionText: string): Promise<ClassifyResult> {
  if (!isAiConfigured()) return { topic_id: null, confidence: 0, needs_review: true };

  const first = await callAI(questionText);
  if (first.topic_id !== null && !isValidSubtopicId(first.topic_id)) {
    const retry = await callAI(questionText);
    if (retry.topic_id !== null && isValidSubtopicId(retry.topic_id)) {
      return { ...retry, needs_review: retry.confidence < CONFIDENCE_THRESHOLD };
    }
    return { topic_id: null, confidence: 0, needs_review: true };
  }
  if (!first.topic_id) return { topic_id: null, confidence: 0, needs_review: true };
  return { ...first, needs_review: first.confidence < CONFIDENCE_THRESHOLD };
}

/**
 * Classify a user's incoming query at request time.
 * Returns null on any error so the caller falls back to ILIKE keyword search.
 */
export async function classifyQueryTopicId(queryText: string): Promise<string | null> {
  if (!isAiConfigured()) return null;
  try {
    const result = await callAI(queryText);
    if (result.topic_id && isValidSubtopicId(result.topic_id) && result.confidence >= CONFIDENCE_THRESHOLD) {
      return result.topic_id;
    }
  } catch {
    // Never block a user query due to classification failure.
  }
  return null;
}

/**
 * Fast keyword-only fallback (no AI, no network).
 * Returns the subtopic with the most keyword hits, or null if < 2 hits.
 */
export function keywordClassifyTopicId(text: string): string | null {
  const lower = text.toLowerCase();
  let bestId: string | null = null;
  let bestScore = 0;
  for (const topic of SUBTOPICS) {
    const hits = topic.keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
    if (hits > bestScore) { bestScore = hits; bestId = topic.id; }
  }
  return bestScore >= 2 ? bestId : null;
}
