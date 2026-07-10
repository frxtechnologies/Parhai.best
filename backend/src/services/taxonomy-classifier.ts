/**
 * Multi-subject taxonomy classifier.
 * Uses a CLOSED-SET AI prompt built from the requested subject's taxonomy — the
 * model can only pick an id that exists for that subject. Any subject registered
 * in taxonomy-registry is supported automatically; unknown subjects return null
 * (unclassified) instead of guessing.
 */

import { generateAiJson, isAiConfigured } from "../lib/ai-service";
import {
  getSubjectTaxonomy,
  hasTaxonomy,
  isValidSubtopicId,
  parentTopicId,
  getTopicName,
  ALL_TAXONOMY_TOPICS,
  type TaxonomyTopic,
} from "../data/taxonomy-registry";

export type { TaxonomyTopic };
// Global id helpers (work across every subject) re-exported for callers.
export { isValidSubtopicId, parentTopicId, getTopicName, hasTaxonomy };
export function getAllTaxonomyTopics(): TaxonomyTopic[] {
  return ALL_TAXONOMY_TOPICS;
}

const CONFIDENCE_THRESHOLD = Number(process.env.TAXONOMY_CONFIDENCE_THRESHOLD ?? "0.75");

type ClassifyResult = { topic_id: string | null; confidence: number; needs_review: boolean };

/** Whether an id is a level-2 subtopic of THIS subject (prevents cross-subject leakage). */
function isSubtopicOfSubject(id: string, subjectCode: string): boolean {
  const tax = getSubjectTaxonomy(subjectCode);
  return !!tax && tax.topics.some((t) => t.level === 2 && t.id === id);
}

function buildChoiceList(topics: TaxonomyTopic[]): string {
  const subs = topics.filter((t) => t.level === 2);
  return subs
    .map((t) => {
      const parent = topics.find((p) => p.id === t.parent_id);
      return `${t.id}  →  ${parent?.name ?? ""} > ${t.name}`;
    })
    .join("\n");
}

async function callAI(text: string, subjectCode: string): Promise<ClassifyResult> {
  const tax = getSubjectTaxonomy(subjectCode);
  if (!tax) return { topic_id: null, confidence: 0, needs_review: true };

  const system = `You are a ${tax.label} topic classifier.
Pick exactly ONE topic_id from this list. Output ONLY valid JSON.

RULES:
1. topic_id must be exactly one of the IDs listed below.
2. confidence is a float 0.0–1.0 (how certain you are).
3. Never invent an id that is not in the list.
4. Output format: {"topic_id": "<id>", "confidence": <number>}

VALID IDS:
${buildChoiceList(tax.topics)}`;

  const user = `Classify this ${tax.label} question:\n\n${text.slice(0, 1400)}`;
  const raw = await generateAiJson(system, user);

  let parsed: { topic_id?: unknown; confidence?: unknown };
  try {
    const clean = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return { topic_id: null, confidence: 0, needs_review: true };
  }

  const id = typeof parsed.topic_id === "string" ? parsed.topic_id.trim() : null;
  const confidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0;
  return { topic_id: id, confidence, needs_review: false };
}

/**
 * Classify a question at ingestion / batch time for a given subject.
 * Retries once on a hallucinated/cross-subject id, then marks needs_review=true.
 */
export async function classifyQuestionTopicId(questionText: string, subjectCode: string): Promise<ClassifyResult> {
  if (!isAiConfigured() || !hasTaxonomy(subjectCode)) return { topic_id: null, confidence: 0, needs_review: true };

  const first = await callAI(questionText, subjectCode);
  if (first.topic_id !== null && !isSubtopicOfSubject(first.topic_id, subjectCode)) {
    const retry = await callAI(questionText, subjectCode);
    if (retry.topic_id !== null && isSubtopicOfSubject(retry.topic_id, subjectCode)) {
      return { ...retry, needs_review: retry.confidence < CONFIDENCE_THRESHOLD };
    }
    return { topic_id: null, confidence: 0, needs_review: true };
  }
  if (!first.topic_id) return { topic_id: null, confidence: 0, needs_review: true };
  return { ...first, needs_review: first.confidence < CONFIDENCE_THRESHOLD };
}

/**
 * Classify a user's incoming query at request time for a given subject.
 * Returns null on any error so the caller falls back to keyword search.
 */
export async function classifyQueryTopicId(queryText: string, subjectCode: string): Promise<string | null> {
  if (!isAiConfigured() || !hasTaxonomy(subjectCode)) return null;
  try {
    const result = await callAI(queryText, subjectCode);
    if (result.topic_id && isSubtopicOfSubject(result.topic_id, subjectCode) && result.confidence >= CONFIDENCE_THRESHOLD) {
      return result.topic_id;
    }
  } catch {
    // Never block a user query due to classification failure.
  }
  return null;
}

/**
 * Fast keyword-only fallback (no AI, no network) scoped to the subject.
 * Returns the subtopic with the most keyword hits, or null if < 2 hits.
 */
export function keywordClassifyTopicId(text: string, subjectCode: string): string | null {
  const tax = getSubjectTaxonomy(subjectCode);
  if (!tax) return null;
  const lower = text.toLowerCase();
  let bestId: string | null = null;
  let bestScore = 0;
  for (const topic of tax.topics.filter((t) => t.level === 2)) {
    const hits = topic.keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
    if (hits > bestScore) { bestScore = hits; bestId = topic.id; }
  }
  return bestScore >= 2 ? bestId : null;
}
