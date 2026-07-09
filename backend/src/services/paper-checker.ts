import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeImages, generateAiAnswer, type VisionInput } from "../lib/ai-service";
import { retrieveGroundedContext, type GroundedSource, type RetrievalSubject } from "./rag-retrieval";

/**
 * AI Paper Checker.
 *
 * Marks a student's completed answer sheet against official Cambridge marking
 * schemes. Vision reads and separates answers per question; RAG supplies the
 * linked marking scheme; the LLM awards marks strictly against those criteria;
 * and a deterministic aggregator computes totals, percentage, grade, and topic
 * strengths (never trusting the LLM to do the arithmetic). Uploads are processed
 * in memory and never persisted.
 */

export interface MarkedQuestion {
  questionNumber: string;
  topic: string | null;
  awardedMarks: number;
  totalMarks: number;
  whatWentWell: string;
  missingPoints: string;
  modelAnswer: string;
}

export interface TopicPerformance {
  topic: string;
  awarded: number;
  total: number;
  ratio: number;
}

export interface PaperReport {
  questions: MarkedQuestion[];
  totalAwarded: number;
  totalPossible: number;
  percentage: number;
  grade: string;
  strongTopics: string[];
  weakTopics: string[];
  topicBreakdown: TopicPerformance[];
  usedGroundedSources: boolean;
  sources: Array<{ index: number; type: string; reference: string }>;
}

// Approximate IGCSE/O Level percentage grade boundaries. Real boundaries are set
// per paper per session; this is a transparent estimate, labelled as such to the
// student. Ordered high → low so the first satisfied threshold wins.
const GRADE_BOUNDARIES: Array<{ grade: string; min: number }> = [
  { grade: "A*", min: 90 },
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
  { grade: "D", min: 50 },
  { grade: "E", min: 40 },
  { grade: "U", min: 0 },
];

export function estimateGrade(percentage: number): string {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  return GRADE_BOUNDARIES.find((boundary) => clamped >= boundary.min)?.grade ?? "U";
}

/** Deterministically aggregate per-question marks into a full report body. */
export function aggregatePaperResult(questions: MarkedQuestion[]): Omit<PaperReport, "usedGroundedSources" | "sources"> {
  const sanitized = questions.map((question) => {
    const total = Math.max(0, Math.round(question.totalMarks));
    const awarded = Math.min(Math.max(0, Math.round(question.awardedMarks)), total); // never award more than available
    return { ...question, totalMarks: total, awardedMarks: awarded };
  });

  const totalAwarded = sanitized.reduce((sum, q) => sum + q.awardedMarks, 0);
  const totalPossible = sanitized.reduce((sum, q) => sum + q.totalMarks, 0);
  const percentage = totalPossible > 0 ? Math.round((totalAwarded / totalPossible) * 100) : 0;

  const byTopic = new Map<string, { awarded: number; total: number }>();
  for (const question of sanitized) {
    const topic = question.topic?.trim() || "General";
    const entry = byTopic.get(topic) ?? { awarded: 0, total: 0 };
    entry.awarded += question.awardedMarks;
    entry.total += question.totalMarks;
    byTopic.set(topic, entry);
  }

  const topicBreakdown: TopicPerformance[] = [...byTopic.entries()]
    .map(([topic, { awarded, total }]) => ({ topic, awarded, total, ratio: total > 0 ? awarded / total : 0 }))
    .sort((a, b) => a.ratio - b.ratio);

  return {
    questions: sanitized,
    totalAwarded,
    totalPossible,
    percentage,
    grade: estimateGrade(percentage),
    strongTopics: topicBreakdown.filter((t) => t.total > 0 && t.ratio >= 0.75).map((t) => t.topic),
    weakTopics: topicBreakdown.filter((t) => t.total > 0 && t.ratio < 0.5).map((t) => t.topic),
    topicBreakdown,
  };
}

const EXTRACTION_SYSTEM =
  "You are a Cambridge OCR engine. Read the student's completed answer sheet across all pages. Transcribe each answer, " +
  "detecting handwritten and typed text, and separate answers by question number. Do not mark or judge them. Reply ONLY with strict JSON.";

const EXTRACTION_PROMPT =
  "Return JSON: { subjectGuess: string|null, answers: [{ questionNumber: string, answerText: string, topic: string|null }] }. " +
  "Preserve equations and working. If a question number is unclear, infer it from order.";

const MARKING_SYSTEM =
  "You are a strict but fair Cambridge examiner. Mark each answer ONLY against the official marking-scheme points provided. " +
  "Never invent marking criteria; if no scheme is available for a question, set totalMarks to your best estimate from the " +
  "answer's marks cue and explain the uncertainty. Award marks exactly per the criteria. Reply ONLY with strict JSON.";

type ExtractedAnswer = { questionNumber: string; answerText: string; topic: string | null };

function parseJson(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The vision model did not return readable answers.");
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

export function normalizeMarkedQuestions(data: unknown): MarkedQuestion[] {
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const record = (row ?? {}) as Record<string, unknown>;
    const total = Number(record.totalMarks);
    const awarded = Number(record.awardedMarks);
    return {
      questionNumber: String(record.questionNumber ?? "").trim() || "?",
      topic: typeof record.topic === "string" && record.topic.trim() ? record.topic.trim() : null,
      totalMarks: Number.isFinite(total) && total > 0 ? total : 0,
      awardedMarks: Number.isFinite(awarded) && awarded > 0 ? awarded : 0,
      whatWentWell: typeof record.whatWentWell === "string" ? record.whatWentWell : "",
      missingPoints: typeof record.missingPoints === "string" ? record.missingPoints : "",
      modelAnswer: typeof record.modelAnswer === "string" ? record.modelAnswer : "",
    };
  });
}

async function resolveSubject(client: SupabaseClient, guess: string | null, hintSubjectId?: number | null): Promise<RetrievalSubject | null> {
  if (hintSubjectId) {
    const { data } = await client.from("subjects").select("id,name,code").eq("id", hintSubjectId).maybeSingle();
    if (data) return data as RetrievalSubject;
  }
  if (!guess) return null;
  const lower = guess.toLowerCase();
  const { data } = await client.from("subjects").select("id,name,code");
  return ((data ?? []).find((s) => lower.includes(String(s.name).toLowerCase()) || String(s.name).toLowerCase().includes(lower)) as RetrievalSubject) ?? null;
}

function buildMarkingPrompt(answers: ExtractedAnswer[], sources: GroundedSource[]): string {
  const sourceBlock = sources.length
    ? sources.map((source, index) => `[S${index + 1}] (${source.sourceType}) ${source.reference}\n${source.content}`).join("\n\n")
    : "No official marking schemes were found. Mark cautiously and flag the uncertainty.";
  const answerBlock = answers.map((a) => `Q${a.questionNumber}${a.topic ? ` (${a.topic})` : ""}: ${a.answerText}`).join("\n\n");
  return [
    "Official marking-scheme sources:",
    sourceBlock,
    "\nStudent answers to mark:",
    answerBlock,
    "\nReturn JSON: { questions: [{ questionNumber, topic, awardedMarks (number), totalMarks (number), whatWentWell, missingPoints, modelAnswer }] }.",
    "Award marks strictly against the scheme points. Keep feedback concise and examiner-style.",
  ].join("\n");
}

export async function checkPaperFromImages(
  client: SupabaseClient,
  images: VisionInput[],
  hintSubjectId?: number | null,
): Promise<PaperReport> {
  const extracted = parseJson(await analyzeImages(EXTRACTION_SYSTEM, EXTRACTION_PROMPT, images, true));
  const answers = (Array.isArray(extracted.answers) ? extracted.answers : []) as ExtractedAnswer[];
  if (answers.length === 0) throw new Error("No answers could be read from the upload. Please retake the pages more clearly.");

  const subject = await resolveSubject(client, typeof extracted.subjectGuess === "string" ? extracted.subjectGuess : null, hintSubjectId);
  const query = answers.map((a) => [a.topic, a.answerText].filter(Boolean).join(" ")).join(" ").slice(0, 2000);
  const sources = subject ? await retrieveGroundedContext(client, subject, query, { limit: 12 }) : [];

  const marked = parseJson(await generateAiAnswer(MARKING_SYSTEM, buildMarkingPrompt(answers, sources)));
  const questions = normalizeMarkedQuestions((marked as { questions?: unknown }).questions);
  if (questions.length === 0) throw new Error("The marking step did not return any results. Please try again.");

  return {
    ...aggregatePaperResult(questions),
    usedGroundedSources: sources.length > 0,
    sources: sources.map((source, index) => ({ index: index + 1, type: source.sourceType, reference: source.reference })),
  };
}
