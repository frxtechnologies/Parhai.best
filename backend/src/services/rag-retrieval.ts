import type { SupabaseClient } from "@supabase/supabase-js";
import { expandSearchTerms, formatCitation, rankEvidence } from "./rag-utils";
import { generateQueryEmbedding, isAiConfigured } from "../lib/ai-service";
import { formatMarkingCriteria, type MarkingPoint } from "./mark-scheme-parser";
import { fetchGoldAnswers, fetchPrivateGroundingChunks } from "./visibility-retrieval";
// Lazy-imported inside retrieveGroundedContext (not at module scope): this file is
// imported by paper-checker.ts / notes-generator.ts and their unit tests, and
// ../lib/supabase throws eagerly without env vars — a top-level import here would
// break every test that merely imports this module without ever calling it.

/**
 * Centralised RAG retrieval shared by the AI features (Question Solver, Notes
 * Generator, Paper Checker). It queries the canonical Cambridge content tables
 * (question_index + ai_chunks over resources) and ranks results in the KC-3
 * priority order:
 *
 *   0. Gold Dataset      (Parhai's own teacher-verified prior answers)
 *   1. Teacher Notes      (TEACHER_NOTES / PRIVATE_GUIDE resources)
 *   2. Mark scheme         (answer_text on the linked question, MARKING_SCHEME chunks)
 *   3. Examiner report      (EXAMINER_REPORT resource chunks)
 *   4. Past paper question   (question_index, verified, no scheme)
 *   5. Public notes            (NOTES/AI_NOTES/FORMULA_SHEET/BOOK/FLASHCARDS)
 *   6. Syllabus / other
 *
 * Callers combine these grounded sources with the LLM, which must cite them and
 * never answer from general knowledge when verified sources exist. Sources
 * carrying metadata.visibilityTier === 'ai_private' must NEVER be shown to a
 * student verbatim — see visibility-retrieval.ts for the enforcement contract.
 */

export type GroundedSourceType =
  | "question"
  | "marking_scheme"
  | "examiner_report"
  | "note"
  | "syllabus"
  | "resource"
  | "gold_answer";

export interface GroundedSource {
  sourceType: GroundedSourceType;
  id: number | string;
  reference: string;
  content: string;
  priority: number; // lower = higher priority in the required retrieval order
  metadata: Record<string, unknown>;
}

export interface RetrievalSubject {
  id: number;
  name: string;
  code: string;
}

const RESOURCE_TYPE_PRIORITY: Record<string, { type: GroundedSourceType; priority: number }> = {
  TEACHER_NOTES: { type: "note", priority: 1 },
  PRIVATE_GUIDE: { type: "note", priority: 1 },
  MARKING_SCHEME: { type: "marking_scheme", priority: 2 },
  EXAMINER_REPORT: { type: "examiner_report", priority: 3 },
  NOTES: { type: "note", priority: 5 },
  AI_NOTES: { type: "note", priority: 5 },
  FORMULA_SHEET: { type: "note", priority: 5 },
  BOOK: { type: "note", priority: 5 },
  FLASHCARDS: { type: "note", priority: 5 },
  SYLLABUS: { type: "syllabus", priority: 6 },
};

function orFilter(terms: string[], columns: string[], limit = 4): string {
  return terms.slice(0, limit).flatMap((term) => columns.map((column) => `${column}.ilike.%${term}%`)).join(",");
}

/**
 * Retrieve grounded Cambridge sources for a free-text query within one subject.
 * Safe to call without an AI key (semantic search is simply skipped).
 */
export async function retrieveGroundedContext(
  client: SupabaseClient,
  subject: RetrievalSubject,
  queryText: string,
  options: { year?: number | null; limit?: number } = {},
): Promise<GroundedSource[]> {
  const terms = expandSearchTerms(queryText);
  const limit = options.limit ?? 14;

  // 1 & 2 & 5: verified questions (with their marking-scheme answers).
  let questionQuery = client.from("question_index")
    .select("id,resource_id,question_number,topic,subtopic,difficulty,marks,total_marks,clean_question_text,display_question_text,question_text,answer_text,marking_points,year,session,paper_code,variant,source_file,marking_scheme_link_status")
    .eq("subject_id", subject.id)
    // Eligibility = usable extracted text, not topic certainty or complete metadata (Phase 0, F9).
    .in("text_quality_status", ["good", "acceptable"])
    .not("clean_question_text", "is", null);
  if (options.year) questionQuery = questionQuery.eq("year", options.year);
  if (terms.length) questionQuery = questionQuery.or(orFilter(terms, ["topic", "subtopic", "clean_question_text"]));

  // 3, 4, 6: examiner reports, notes, syllabus chunks (keyword match).
  let chunkQuery = client.from("ai_chunks")
    .select("id,resource_id,content,metadata,resources!inner(id,title,resource_type,year,session,paper_code,variant,is_approved)")
    .eq("subject_id", subject.id)
    .eq("resources.is_approved", true);
  if (terms.length) chunkQuery = chunkQuery.or(orFilter(terms, ["content"], 3));

  const { supabaseAdmin } = await import("../lib/supabase");
  const [questions, chunks, goldAnswers, privateChunks] = await Promise.all([
    questionQuery.order("year", { ascending: false }).limit(60),
    chunkQuery.limit(40),
    // KC-3: Gold Dataset priority tier (Parhai's own verified prior answers).
    fetchGoldAnswers(supabaseAdmin, subject.id, null, 3).catch(() => []),
    // KC-3: AI_PRIVATE grounding — service-role only; never shown verbatim to a student.
    fetchPrivateGroundingChunks(supabaseAdmin, subject.id, terms, 6).catch(() => []),
  ]);
  if (questions.error) throw questions.error;
  if (chunks.error) throw chunks.error;

  const sources: GroundedSource[] = [];

  for (const gold of goldAnswers) {
    sources.push({ sourceType: "gold_answer", id: gold.id, priority: 0, reference: "Parhai verified knowledge base", content: gold.content, metadata: gold.metadata });
  }
  for (const priv of privateChunks) {
    sources.push({ sourceType: "resource", id: priv.id, priority: 1, reference: "Verified Parhai teaching material", content: priv.content, metadata: { ...priv.metadata, visibilityTier: priv.visibilityTier } });
  }

  for (const row of questions.data ?? []) {
    const hasScheme = Boolean(row.answer_text);
    const markingPoints = (Array.isArray(row.marking_points) ? row.marking_points : []) as MarkingPoint[];
    const metadata = {
      resourceId: row.resource_id, questionNumber: row.question_number, topic: row.topic, subtopic: row.subtopic,
      difficulty: row.difficulty, marks: row.total_marks ?? row.marks, questionText: row.display_question_text ?? row.clean_question_text ?? row.question_text,
      answerText: row.answer_text, markingPoints, year: row.year, session: row.session, paperCode: row.paper_code, variant: row.variant, sourceFile: row.source_file,
    };
    const criteria = markingPoints.length ? `\nMarking criteria:\n${formatMarkingCriteria(markingPoints)}` : "";
    sources.push({
      sourceType: hasScheme ? "marking_scheme" : "question",
      id: row.id,
      priority: hasScheme ? 2 : 4,
      reference: formatCitation(subject, { sourceFile: row.source_file, year: row.year, session: row.session, paperCode: row.paper_code, variant: row.variant, questionNumber: row.question_number }),
      content: `Question: ${row.clean_question_text ?? row.display_question_text ?? row.question_text}${row.answer_text ? `\nOfficial marking scheme: ${row.answer_text}` : ""}${criteria}`.slice(0, 5000),
      metadata,
    });
  }

  for (const chunk of chunks.data ?? []) {
    const resource = Array.isArray(chunk.resources) ? chunk.resources[0] : chunk.resources;
    const mapping = RESOURCE_TYPE_PRIORITY[resource?.resource_type as string] ?? { type: "resource" as GroundedSourceType, priority: 6 };
    const metadata = { resourceId: chunk.resource_id, title: resource?.title, resourceType: resource?.resource_type, year: resource?.year, session: resource?.session, paperCode: resource?.paper_code, variant: resource?.variant };
    sources.push({
      sourceType: mapping.type,
      id: `chunk-${chunk.id}`,
      priority: mapping.priority,
      reference: formatCitation(subject, metadata),
      content: String(chunk.content ?? "").slice(0, 5000),
      metadata,
    });
  }

  // Semantic recall via pgvector (skipped gracefully when no AI key / embeddings).
  if (isAiConfigured()) {
    try {
      const embedding = await generateQueryEmbedding(queryText);
      const { data: semantic } = await client.rpc("match_ai_chunks", {
        query_embedding: `[${embedding.join(",")}]`,
        match_subject_id: subject.id,
        match_count: 10,
        match_threshold: 0.12,
      });
      for (const chunk of (semantic ?? []) as Array<{ id: number; resource_id: number; content: string; metadata: Record<string, unknown> }>) {
        sources.push({
          sourceType: "resource",
          id: `sem-${chunk.id}`,
          priority: 6,
          reference: formatCitation(subject, chunk.metadata),
          content: String(chunk.content ?? "").slice(0, 5000),
          metadata: { ...chunk.metadata, resourceId: chunk.resource_id },
        });
      }
    } catch {
      // Keyword + exact retrieval already populated `sources`.
    }
  }

  // De-duplicate, then order by required priority first and evidence rank second.
  const seen = new Set<string>();
  const unique = sources.filter((source) => {
    const key = `${source.sourceType}:${source.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ranked = rankEvidence(unique, terms, Math.max(limit * 2, 24)) as GroundedSource[];
  return [...ranked].sort((a, b) => a.priority - b.priority).slice(0, limit);
}
