/**
 * Dataset Builder (Phase D).
 *
 * Assembles instruction-tuning examples from Parhai's own structured knowledge —
 * NOT from manual authoring and NOT by calling an API. Two deterministic sources:
 *   1. the question corpus + marking points (a grounded "ideal answer" is derived
 *      from the mark scheme itself), and
 *   2. verified gold rows from the Interaction Ledger.
 * Each example is content-hashed for dedup and tagged with provenance.
 */

import type { MarkingPoint } from "./mark-scheme-parser";

export type TrainingExample = {
  source: "question_corpus" | "gold_ledger";
  subjectCode: string | null;
  topicId: string | null;
  difficulty: string | null;
  marks: number | null;
  instruction: string;
  input: string | null;
  output: string;
  metadata: Record<string, unknown>;
  contentHash: string;
};

/** Stable non-cryptographic hash (djb2) for dedup keys. */
export function contentHash(...parts: string[]): string {
  const text = parts.join("");
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/**
 * Derive a grounded model answer from the mark scheme. The marking points ARE the
 * answer skeleton, so this needs no LLM: each criterion becomes a required step.
 */
export function synthesizeIdealAnswer(markingPoints: MarkingPoint[], answerText: string | null): string {
  if (markingPoints.length > 0) {
    const steps = markingPoints
      .map((p) => {
        const alts = p.alternatives.length > 1 ? ` (accept: ${p.alternatives.join(" / ")})` : "";
        return `- [${p.marks} mark${p.marks === 1 ? "" : "s"}] ${p.text}${alts}`;
      })
      .join("\n");
    return `Model answer (from the official mark scheme):\n${steps}`;
  }
  return (answerText ?? "").trim();
}

export type QuestionRow = {
  clean_question_text: string | null;
  display_question_text: string | null;
  question_text: string | null;
  answer_text: string | null;
  marking_points: unknown;
  taxonomy_topic_id: string | null;
  difficulty: string | null;
  total_marks: number | null;
  marks: number | null;
  subject_code?: string | null;
};

/**
 * Build a training example from one question row, or null if it lacks a usable
 * question or answer (we never fabricate an output).
 */
export function exampleFromQuestion(row: QuestionRow, subjectCode: string | null): TrainingExample | null {
  const question = (row.clean_question_text ?? row.display_question_text ?? row.question_text ?? "").trim();
  if (!question) return null;
  const points = (Array.isArray(row.marking_points) ? row.marking_points : []) as MarkingPoint[];
  const output = synthesizeIdealAnswer(points, row.answer_text);
  if (!output) return null; // no scheme and no answer → not a training example
  const marks = row.total_marks ?? row.marks ?? null;
  const instruction = "Answer this Cambridge exam question and justify each mark against the mark scheme.";
  return {
    source: "question_corpus",
    subjectCode,
    topicId: row.taxonomy_topic_id,
    difficulty: row.difficulty,
    marks,
    instruction,
    input: question,
    output,
    metadata: { markPoints: points.length, hasScheme: Boolean(row.answer_text || points.length) },
    contentHash: contentHash("q", question, output),
  };
}

export type GoldLedgerRow = {
  query_text: string;
  answer_text: string | null;
  subject_code: string | null;
  resolved_topic_id: string | null;
  citations: unknown;
  model_name: string | null;
};

/** Build a training example from a verified gold ledger row. */
export function exampleFromGoldLedger(row: GoldLedgerRow): TrainingExample | null {
  const answer = (row.answer_text ?? "").trim();
  if (!answer || !row.query_text.trim()) return null;
  const citations = Array.isArray(row.citations) ? row.citations : [];
  return {
    source: "gold_ledger",
    subjectCode: row.subject_code,
    topicId: row.resolved_topic_id,
    difficulty: null,
    marks: null,
    instruction: "Answer this Cambridge student's question as an expert examiner, grounded in verified past papers.",
    input: row.query_text.trim(),
    output: answer,
    metadata: { citations: citations.length, teacher: row.model_name },
    contentHash: contentHash("g", row.query_text.trim(), answer),
  };
}
