import { Router, type IRouter } from "express";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAiAnswer, generateQueryEmbedding, getAiConfigurationError, isAiConfigured } from "../lib/ai-service";
import { createUserClient } from "../lib/supabase";
import { requireUser } from "../middleware/auth";
import { expandSearchTerms, finalizeGroundedAnswer, formatCitation, rankEvidence } from "../services/rag-utils";
import { assistantModeFor, cambridgeTeacherName, finalizeTeacherAnswer, requestedOutsideSubject } from "../services/teacher-mode";

const router: IRouter = Router();
const MISSING_SOURCE_MESSAGE = "I could not find this in the uploaded papers yet.";
const UNPROCESSED_PAPER_MESSAGE = "This paper is uploaded but not processed yet. Please process it first.";

const RequestBody = z.object({
  message: z.string().trim().min(1).max(4000),
  subjectId: z.coerce.number().int().positive(),
  subjectName: z.string().trim().min(1).max(120).optional(),
  level: z.enum(["O_LEVEL", "A_LEVEL"]),
  board: z.string().trim().min(1).max(80).optional(),
  selectedPaperId: z.coerce.number().int().positive().nullable().optional(),
  year: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  chatHistory: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(100).transform((history) => history.slice(-20)).optional(),
  debug: z.boolean().optional().default(false),
});

type SourceResult = {
  sourceType: "resource" | "paper" | "question" | "topic" | "note";
  id: number;
  paperId: number | null;
  reference: string;
  content: string;
  metadata: Record<string, unknown>;
};

async function retrieveResourceSources(client: SupabaseClient, input: z.infer<typeof RequestBody>, subject: { id: number; name: string; code: string }) {
  const { year, terms } = getFilters(input.message, input.year);
  let resourcesQuery = client.from("resources")
    .select("id,title,resource_type,year,session,paper_code,variant,processing_status")
    .eq("subject_id", subject.id).eq("is_approved", true);
  if (year) resourcesQuery = resourcesQuery.eq("year", year);

  let chunksQuery = client.from("ai_chunks")
    .select("id,resource_id,chunk_index,content,metadata,resources!inner(id,title,resource_type,year,session,paper_code,variant,processing_status,is_approved)")
    .eq("subject_id", subject.id).eq("resources.is_approved", true);
  if (year) chunksQuery = chunksQuery.eq("resources.year", year);
  if (terms.length) chunksQuery = chunksQuery.or(terms.slice(0, 3).map((term) => `content.ilike.%${term}%`).join(","));

  const queryEmbedding = await generateQueryEmbedding(input.message);
  const semanticQuery = client.rpc("match_ai_chunks", {
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_subject_id: subject.id,
    match_count: 12,
    match_threshold: 0.12,
  });
  let indexedQuery = client.from("question_index")
    .select("id,resource_id,legacy_source_id,question_number,topic,subtopic,difficulty,marks,question_text,answer_text,question_screenshot_url,source_page,source_file,year,session,paper_code,variant,resources!inner(title,is_approved)")
    .eq("subject_id", subject.id).eq("resources.is_approved", true);
  if (year) indexedQuery = indexedQuery.eq("year", year);
  if (terms.length) indexedQuery = indexedQuery.or(terms.slice(0, 4).flatMap((term) => [`topic.ilike.%${term}%`, `subtopic.ilike.%${term}%`, `question_text.ilike.%${term}%`, `answer_text.ilike.%${term}%`]).join(","));
  const [resources, chunks, semantic, indexed] = await Promise.all([resourcesQuery.order("year", { ascending: false }).limit(100), chunksQuery.limit(20), semanticQuery, indexedQuery.limit(100)]);
  if (resources.error) throw resources.error;
  if (chunks.error) throw chunks.error;
  if (semantic.error) throw semantic.error;
  if (indexed.error) throw indexed.error;
  const keywordSources: SourceResult[] = (chunks.data ?? []).map((chunk) => {
    const resource = Array.isArray(chunk.resources) ? chunk.resources[0] : chunk.resources;
    const metadata = { resourceId: chunk.resource_id, chunkIndex: chunk.chunk_index, title: resource?.title, resourceType: resource?.resource_type, year: resource?.year, session: resource?.session, paperCode: resource?.paper_code, variant: resource?.variant, sourceFile: chunk.metadata?.sourceFile };
    return { sourceType: "resource", id: chunk.id, paperId: null, reference: formatCitation(subject, metadata), content: chunk.content.slice(0, 5000), metadata };
  });
  const semanticSources: SourceResult[] = (semantic.data ?? [])
    .filter((chunk: { metadata: Record<string, unknown> }) => !year || Number(chunk.metadata.year) === year)
    .map((chunk: { id: number; resource_id: number; chunk_index: number; content: string; metadata: Record<string, unknown>; similarity: number }) => ({
    sourceType: "resource",
    id: chunk.id,
    paperId: null,
    reference: formatCitation(subject, chunk.metadata),
    content: chunk.content.slice(0, 5000),
    metadata: { ...chunk.metadata, resourceId: chunk.resource_id, chunkIndex: chunk.chunk_index, similarity: chunk.similarity },
    }));
  const questionSources: SourceResult[] = (indexed.data ?? []).map((row) => ({
    sourceType: "question",
    id: row.id,
    paperId: null,
    reference: formatCitation(subject, { sourceFile: row.source_file, year: row.year, session: row.session, paperCode: row.paper_code, variant: row.variant, questionNumber: row.question_number }),
    content: `Question: ${row.question_text}${row.answer_text ? `\nMarking scheme answer: ${row.answer_text}` : ""}`.slice(0, 5000),
    metadata: { resourceId: row.resource_id, legacyQuestionId: row.legacy_source_id, questionNumber: row.question_number, topic: row.topic, subtopic: row.subtopic, difficulty: row.difficulty, marks: row.marks, questionText: row.question_text, answerText: row.answer_text, screenshotUrl: row.question_screenshot_url, sourcePage: row.source_page, sourceFile: row.source_file, year: row.year, session: row.session, paperCode: row.paper_code, variant: row.variant },
  }));
  const seen = new Set<string>();
  const uniqueSources = [...questionSources, ...semanticSources, ...keywordSources].filter((source) => {
    const key = `${source.sourceType}:${source.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sources = rankEvidence(uniqueSources, terms, 12);
  return { resources: resources.data ?? [], sources, indexedQuestionCount: indexed.data?.length ?? 0 };
}

function getFilters(message: string, explicitYear?: number | null) {
  const year = (explicitYear ?? Number(message.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0)) || null;
  const paperNumber = Number(message.match(/(?:paper|p)\s*(\d{1,2})\b/i)?.[1] ?? 0) || null;
  const lower = message.toLowerCase();
  const session = lower.includes("may/june") || lower.includes("may june") ? "MAY_JUNE"
    : lower.includes("oct/nov") || lower.includes("oct nov") ? "OCT_NOV"
      : lower.includes("feb/march") || lower.includes("feb march") ? "FEB_MAR" : null;
  return { year, paperNumber, session, terms: expandSearchTerms(message) };
}

async function retrieveSources(client: SupabaseClient, input: z.infer<typeof RequestBody>, subject: { id: number; name: string; code: string }) {
  const { year, paperNumber, session, terms } = getFilters(input.message, input.year);
  const searchTerms = terms.slice(0, 4);

  let papersQuery = client.from("papers")
    .select("id,title,year,session,paper_number,variant,source_type,raw_text,ingestion_status")
    .eq("subject_id", subject.id);
  if (input.selectedPaperId) papersQuery = papersQuery.eq("id", input.selectedPaperId);
  if (year) papersQuery = papersQuery.eq("year", year);
  if (paperNumber) papersQuery = papersQuery.eq("paper_number", paperNumber);
  if (session) papersQuery = papersQuery.eq("session", session);
  let questionsQuery = client.from("questions")
    .select("id,paper_id,question_number,question,question_text,extracted_text,topic,subtopic,difficulty,marks,year,papers!inner(title,session,paper_number,variant)")
    .eq("subject_id", subject.id);
  if (input.selectedPaperId) questionsQuery = questionsQuery.eq("paper_id", input.selectedPaperId);
  if (year) questionsQuery = questionsQuery.eq("year", year);
  if (paperNumber) questionsQuery = questionsQuery.eq("papers.paper_number", paperNumber);
  if (session) questionsQuery = questionsQuery.eq("papers.session", session);
  if (searchTerms.length) questionsQuery = questionsQuery.or(searchTerms.flatMap((term) => [
    `topic.ilike.%${term}%`, `subtopic.ilike.%${term}%`, `question_text.ilike.%${term}%`,
    `question.ilike.%${term}%`, `extracted_text.ilike.%${term}%`,
  ]).join(","));

  let questionCountQuery = client.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", subject.id);
  if (input.selectedPaperId) questionCountQuery = questionCountQuery.eq("paper_id", input.selectedPaperId);
  if (year) questionCountQuery = questionCountQuery.eq("year", year);

  let notesQuery = client.from("notes").select("id,title,topic,content,summary").eq("subject_id", subject.id);
  if (searchTerms.length) notesQuery = notesQuery.or(searchTerms.flatMap((term) => [
    `title.ilike.%${term}%`, `topic.ilike.%${term}%`, `content.ilike.%${term}%`, `summary.ilike.%${term}%`,
  ]).join(","));

  let topicsQuery = client.from("topics").select("id,name,slug").eq("subject_id", subject.id);
  if (searchTerms.length) topicsQuery = topicsQuery.or(searchTerms.flatMap((term) => [
    `name.ilike.%${term}%`, `slug.ilike.%${term}%`,
  ]).join(","));

  const [papers, questions, topics, notes, questionCount] = await Promise.all([
    papersQuery.limit(20), questionsQuery.limit(200), topicsQuery.limit(30), notesQuery.limit(30), questionCountQuery,
  ]);
  for (const result of [papers, questions, topics, notes, questionCount]) if (result.error) throw result.error;

  const results: SourceResult[] = [];
  for (const row of questions.data ?? []) {
    const paper = Array.isArray(row.papers) ? row.papers[0] : row.papers;
    const metadata = { legacyQuestionId: row.id, title: paper?.title, sourceFile: paper?.title, year: row.year, session: paper?.session, paperNumber: paper?.paper_number, variant: paper?.variant, questionNumber: row.question_number, topic: row.topic, subtopic: row.subtopic, difficulty: row.difficulty, marks: row.marks };
    results.push({
      sourceType: "question", id: row.id, paperId: row.paper_id,
      reference: formatCitation(subject, metadata),
      content: [row.question_text ?? row.question, row.extracted_text].filter(Boolean).join("\n").slice(0, 4000),
      metadata,
    });
  }
  for (const row of notes.data ?? []) results.push({ sourceType: "note", id: row.id, paperId: null, reference: `${subject.name} note: ${row.title}`, content: [row.topic, row.summary, row.content].filter(Boolean).join("\n").slice(0, 4000), metadata: { topic: row.topic } });
  for (const row of topics.data ?? []) results.push({ sourceType: "topic", id: row.id, paperId: null, reference: `${subject.name} topic: ${row.name}`, content: row.name, metadata: { slug: row.slug } });
  for (const row of papers.data ?? []) {
    const metadata = { title: row.title, sourceFile: row.title, year: row.year, session: row.session, paperNumber: row.paper_number, variant: row.variant, sourceType: row.source_type, ingestionStatus: row.ingestion_status, hasExtractedText: Boolean(row.raw_text) };
    results.push({ sourceType: "paper", id: row.id, paperId: row.id, reference: formatCitation(subject, metadata), content: [row.title, row.raw_text].filter(Boolean).join("\n").slice(0, 4000), metadata });
  }

  return { sources: rankEvidence(results, terms, 12), matchedPapers: papers.data ?? [], matchedQuestions: questions.data ?? [], extractedQuestionCount: questionCount.count ?? 0 };
}

router.post("/ai-assistant", requireUser, async (req, res): Promise<void> => {
  try {
    const parsed = RequestBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid AI request." }); return; }
    if (!isAiConfigured()) { res.status(503).json({ error: getAiConfigurationError() }); return; }

    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const client = createUserClient(token!);
    const input = parsed.data;
    const { data: subject, error: subjectError } = await client.from("subjects").select("id,name,code,level,board").eq("id", input.subjectId).eq("level", input.level).single();
    if (subjectError || !subject) { res.status(404).json({ error: "Subject not found." }); return; }
    if (input.subjectName && input.subjectName.toLowerCase() !== subject.name.toLowerCase()) { res.status(400).json({ error: "Subject scope does not match the selected subject." }); return; }
    if (input.board && input.board.toLowerCase() !== subject.board.toLowerCase()) { res.status(400).json({ error: "Board scope does not match the selected subject." }); return; }
    const mode = assistantModeFor(input.message);
    const teacherName = cambridgeTeacherName(subject.name);
    if (requestedOutsideSubject(input.message, subject.name)) {
      res.json({ answer: `I’m your ${teacherName}, so I can only help with ${subject.name} in this workspace. Please open the correct subject page for that question.`, sources: [], ...(input.debug ? { diagnostics: { mode, activeSubject: subject.name, blockedOutsideSubject: true }, retrievedResults: [] } : {}) });
      return;
    }

    const [resourceRetrieval, legacyRetrieval] = await Promise.all([
      retrieveResourceSources(client, input, subject),
      retrieveSources(client, input, subject),
    ]);
    const diagnostics: Record<string, unknown> = {
      matchedResources: resourceRetrieval.resources,
      matchedChunks: resourceRetrieval.sources.length,
      indexedQuestions: resourceRetrieval.indexedQuestionCount,
      matchedPapers: legacyRetrieval.matchedPapers,
      extractedQuestionCount: legacyRetrieval.extractedQuestionCount,
      matchedQuestionRows: legacyRetrieval.matchedQuestions,
      mode,
      teacher: teacherName,
    };
    const combined = [...resourceRetrieval.sources, ...legacyRetrieval.sources];
    const seenEvidence = new Set<string>();
    const retrieved = rankEvidence(combined.filter((source) => {
      const key = `${source.sourceType}:${source.metadata.legacyQuestionId ?? source.metadata.resourceId ?? source.paperId ?? source.id}:${source.metadata.questionNumber ?? ""}:${source.content.slice(0, 120)}`;
      if (seenEvidence.has(key)) return false;
      seenEvidence.add(key);
      return true;
    }), getFilters(input.message, input.year).terms, 12);
    const onlyUnprocessedResources = resourceRetrieval.resources.length > 0 && resourceRetrieval.resources.every((resource) => resource.processing_status !== "processed");
    const onlyUnprocessedPapers = legacyRetrieval.matchedPapers.length > 0 && legacyRetrieval.extractedQuestionCount === 0;
    if (mode === "rag" && !retrieved.length && (onlyUnprocessedResources || onlyUnprocessedPapers)) {
      res.json({ answer: onlyUnprocessedResources ? "This resource is uploaded but not processed yet. Please process it first." : UNPROCESSED_PAPER_MESSAGE, sources: [], ...(input.debug ? { retrievedResults: [], diagnostics } : {}) });
      return;
    }
    if (mode === "rag" && retrieved.length === 0) { res.json({ answer: MISSING_SOURCE_MESSAGE, sources: [], ...(input.debug ? { retrievedResults: [], diagnostics } : {}) }); return; }

    const context = retrieved.map((source, index) => `[S${index + 1}] ${source.reference}\nMetadata: ${JSON.stringify(source.metadata)}\n${source.content}`).join("\n\n");
    const recentHistory = (input.chatHistory ?? []).slice(-8).map((message) => `${message.role === "user" ? "Student" : "Assistant"}: ${message.content}`).join("\n");
    let answer: string;
    try {
      const levelLabel = subject.level === "O_LEVEL" ? "O Level" : "A Level";
      const modeRules = mode === "rag"
        ? `RAG MODE — use only the supplied Supabase evidence. Cite every factual claim with [S#]. Never invent a paper, question, mark, date, answer, or citation. If evidence is insufficient, reply exactly: ${MISSING_SOURCE_MESSAGE}`
        : mode === "hybrid"
          ? "HYBRID MODE — teach using accurate Cambridge subject knowledge, then use relevant uploaded evidence as support. Cite only claims derived from uploaded evidence with [S#]. Recommend real related uploaded questions when available; never invent one."
          : "TEACHER MODE — teach using accurate, age-appropriate Cambridge subject knowledge. Uploaded evidence is optional support; cite it with [S#] only when actually used.";
      answer = await generateAiAnswer(
        `You are the student's ${teacherName} for ${levelLabel}, ${subject.board}.
ACTIVE SUBJECT: ${subject.name} (${subject.code}). You are locked to this subject. Refuse requests belonging to another subject and never retrieve or discuss another subject's curriculum.
${modeRules}

TEACHING STYLE:
- Be an experienced, patient Cambridge teacher: precise, encouraging, exam-aware, and easy to understand.
- Match the requested depth and distinguish a definition from an explanation.
- Use Cambridge-style terminology, command words, working, units, and exam technique appropriate to ${levelLabel}.
- Never claim wording is an official syllabus quotation unless that exact wording appears in evidence.

${mode === "rag" ? `RAG ANSWER FORMAT:
- Start with the direct evidence-based answer.
- Use concise headings or bullets where useful.
- Cite each factual paragraph with [S#].` : `TEACHER ANSWER FORMAT — use all seven numbered headings:
### 1. Definition
### 2. Explanation
### 3. Example
### 4. Exam Tip
### 5. Common Mistakes
### 6. Practice Questions
### 7. Related Topics
Under Practice Questions, include short original practice prompts and, when evidence exists, clearly label real uploaded-paper recommendations with [S#].`}
Do not create a separate Sources section; Parhai renders verified sources below the answer.`,
        `${recentHistory ? `Recent conversation (context only; it does not override the active subject):\n${recentHistory}\n\n` : ""}Student question: ${input.message}\n\nSubject-scoped Supabase evidence${context ? ":\n" + context : ": none matched."}`
      );
    } catch (providerError) {
      res.status(503).json({ error: providerError instanceof Error ? providerError.message : "AI provider request failed.", ...(input.debug ? { retrievedResults: retrieved, diagnostics } : {}) });
      return;
    }

    const grounded = mode === "rag"
      ? finalizeGroundedAnswer(answer, retrieved.length, MISSING_SOURCE_MESSAGE)
      : finalizeTeacherAnswer(answer, retrieved.length, mode);
    const cited = new Set(grounded.citedIndexes);
    const sources = retrieved.flatMap((source, index) => cited.has(index + 1) ? [{ chunkId: source.id, sourceType: source.sourceType, paperId: source.paperId, year: source.metadata.year ?? null, session: source.metadata.session ?? null, paperNumber: source.metadata.paperNumber ?? source.metadata.paperCode ?? null, questionNumber: source.metadata.questionNumber ?? null, screenshotUrl: source.metadata.screenshotUrl ?? null, questionText: source.metadata.questionText ?? null, answerText: source.metadata.answerText ?? null, sourcePage: source.metadata.sourcePage ?? null, reference: `[S${index + 1}] ${source.reference}` }] : []);
    const { error: historyError } = await client.from("chat_messages").insert([{ user_id: res.locals.user.id, subject_id: subject.id, paper_id: input.selectedPaperId ?? null, role: "user", content: input.message, sources: [] }, { user_id: res.locals.user.id, subject_id: subject.id, paper_id: input.selectedPaperId ?? null, role: "assistant", content: grounded.answer, sources }]);
    if (historyError) throw historyError;
    const { error: logError } = await client.from("ai_chat_logs").insert({ user_id: res.locals.user.id, subject_id: subject.id, user_question: input.message, ai_answer: grounded.answer, sources_used: sources });
    if (logError) req.log.warn({ logError }, "Could not save AI audit log");

    res.json({ answer: grounded.answer, sources, ...(input.debug ? { retrievedResults: retrieved, diagnostics } : {}) });
  } catch (error) {
    req.log.error({ error }, "AI assistant request failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "AI assistant request failed." });
  }
});

export default router;
