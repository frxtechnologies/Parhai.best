import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeImages, generateAiAnswer, type VisionInput } from "../lib/ai-service";
import { retrieveGroundedContext, type GroundedSource, type RetrievalSubject } from "./rag-retrieval";

/**
 * AI Question Solver.
 *
 * Pipeline: vision OCR + metadata extraction → subject resolution → centralised
 * RAG retrieval (marking scheme, examiner report, similar questions, notes) →
 * grounded Cambridge-style worked solution with citations. If OCR confidence is
 * low the caller is asked to retake the image rather than risk a wrong solve.
 */

export const OCR_CONFIDENCE_THRESHOLD = 0.55;

export interface ExtractedQuestion {
  questionText: string;
  subjectGuess: string | null;
  paper: string | null;
  session: string | null;
  variant: string | null;
  questionNumber: string | null;
  marks: number | null;
  topic: string | null;
  subtopic: string | null;
  hasEquations: boolean;
  hasDiagram: boolean;
  confidence: number; // 0..1 self-reported OCR/understanding confidence
}

export interface SolvedQuestion {
  needsRetake: boolean;
  extraction: ExtractedQuestion;
  answer?: string; // grounded markdown solution with [S#] citations
  sources?: Array<{ index: number; type: string; reference: string }>;
  matchedSubject?: { id: number; name: string; code: string } | null;
  usedGroundedSources?: boolean;
}

const EXTRACTION_SYSTEM =
  "You are a Cambridge examinations OCR and question-analysis engine. Read the provided image(s) of an exam question " +
  "exactly. Transcribe all text, preserving mathematical equations (use LaTeX-style notation), tables, and the wording " +
  "of each sub-part. Note whether diagrams/graphs/tables/chemical structures are present. Do not solve the question. " +
  "Reply ONLY with strict JSON.";

const EXTRACTION_PROMPT =
  "Extract this exam question. Return JSON with keys: questionText (string, full transcription), subjectGuess (string|null, " +
  "e.g. Physics/Chemistry/Mathematics), paper (string|null), session (string|null), variant (string|null), questionNumber " +
  "(string|null), marks (number|null), topic (string|null), subtopic (string|null), hasEquations (boolean), hasDiagram " +
  "(boolean), confidence (number 0..1: how confident you are that the transcription is complete and legible). " +
  "If the image is blurry, cropped, or unreadable, set a low confidence.";

function parseJsonObject(raw: string): Record<string, unknown> {
  // Vision models sometimes wrap JSON in prose or code fences; extract the object.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("The vision model did not return readable question data.");
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

export function normalizeExtraction(data: Record<string, unknown>): ExtractedQuestion {
  const asString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const confidenceRaw = Number(data.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.min(Math.max(confidenceRaw, 0), 1) : 0;
  const marksRaw = Number(data.marks);
  return {
    questionText: asString(data.questionText) ?? "",
    subjectGuess: asString(data.subjectGuess),
    paper: asString(data.paper),
    session: asString(data.session),
    variant: asString(data.variant),
    questionNumber: asString(data.questionNumber),
    marks: Number.isFinite(marksRaw) && marksRaw > 0 ? marksRaw : null,
    topic: asString(data.topic),
    subtopic: asString(data.subtopic),
    hasEquations: Boolean(data.hasEquations),
    hasDiagram: Boolean(data.hasDiagram),
    confidence,
  };
}

/** Resolve the student's subject: honour an explicit hint, else match the OCR subject guess. */
export async function resolveSubject(
  client: SupabaseClient,
  extraction: ExtractedQuestion,
  hintSubjectId?: number | null,
): Promise<RetrievalSubject | null> {
  if (hintSubjectId) {
    const { data } = await client.from("subjects").select("id,name,code").eq("id", hintSubjectId).maybeSingle();
    if (data) return data as RetrievalSubject;
  }
  const guess = extraction.subjectGuess?.toLowerCase();
  if (!guess) return null;
  const { data } = await client.from("subjects").select("id,name,code");
  const match = (data ?? []).find((s) => guess.includes(String(s.name).toLowerCase()) || String(s.name).toLowerCase().includes(guess));
  return (match as RetrievalSubject) ?? null;
}

function buildSolutionPrompt(extraction: ExtractedQuestion, sources: GroundedSource[]): string {
  const sourceBlock = sources.length
    ? sources.map((source, index) => `[S${index + 1}] (${source.sourceType}) ${source.reference}\n${source.content}`).join("\n\n")
    : "No verified Cambridge sources were found for this question.";
  return [
    `Student's question (from OCR):\n${extraction.questionText}`,
    extraction.marks ? `Marks available: ${extraction.marks}` : "",
    `\nVerified Cambridge sources (cite these as [S#]):\n${sourceBlock}`,
    "\nProduce a Cambridge-style worked solution in markdown with these sections:",
    "### Final answer",
    "### Step-by-step working (number each step; show the equation, substitution with units, and why the step is correct)",
    "### Common mistakes (what examiners penalise here)",
    "### Confidence (state High/Medium/Low and why)",
    "Cite the verified sources as [S#] wherever you rely on them. If the sources do not cover part of the question, say so explicitly rather than inventing marking criteria.",
  ].filter(Boolean).join("\n");
}

const SOLUTION_SYSTEM =
  "You are an experienced Cambridge teacher and examiner. Explain with the rigour and language of official mark schemes. " +
  "Prefer the provided verified sources over general knowledge, and cite them as [S#]. Never fabricate marking criteria. " +
  "Support equations in LaTeX-style notation and structured markdown.";

/**
 * Run the full solve pipeline. `images` are already-decoded base64 payloads.
 */
export async function solveQuestionFromImages(
  client: SupabaseClient,
  images: VisionInput[],
  hintSubjectId?: number | null,
): Promise<SolvedQuestion> {
  const rawExtraction = await analyzeImages(EXTRACTION_SYSTEM, EXTRACTION_PROMPT, images, true);
  const extraction = normalizeExtraction(parseJsonObject(rawExtraction));

  if (!extraction.questionText || extraction.confidence < OCR_CONFIDENCE_THRESHOLD) {
    return { needsRetake: true, extraction };
  }

  const subject = await resolveSubject(client, extraction, hintSubjectId);
  const sources = subject
    ? await retrieveGroundedContext(client, subject, [extraction.topic, extraction.subtopic, extraction.questionText].filter(Boolean).join(" "), { limit: 10 })
    : [];

  const answer = await generateAiAnswer(SOLUTION_SYSTEM, buildSolutionPrompt(extraction, sources));

  return {
    needsRetake: false,
    extraction,
    answer,
    matchedSubject: subject,
    usedGroundedSources: sources.length > 0,
    sources: sources.map((source, index) => ({ index: index + 1, type: source.sourceType, reference: source.reference })),
  };
}
