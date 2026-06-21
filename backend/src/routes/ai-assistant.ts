import { Router, type IRouter } from "express";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateGroundedAnswer, generateQueryEmbedding, GEMINI_NOT_CONFIGURED, isGeminiConfigured } from "../lib/gemini";
import { createUserClient } from "../lib/supabase";
import { requireUser } from "../middleware/auth";

const router: IRouter = Router();
const MISSING_SOURCE_MESSAGE = "I could not find this in the uploaded papers yet.";
const UNPROCESSED_PAPER_MESSAGE = "This paper is uploaded but not processed yet. Please process it first.";

const RequestBody = z.object({
  message: z.string().trim().min(1).max(4000),
  subjectId: z.coerce.number().int().positive(),
  level: z.enum(["O_LEVEL", "A_LEVEL"]),
  selectedPaperId: z.coerce.number().int().positive().nullable().optional(),
  year: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  chatHistory: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).optional(),
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

async function retrieveResourceSources(client: SupabaseClient, input: z.infer<typeof RequestBody>, subject: { id: number; name: string }) {
  const { year, terms } = getFilters(input.message, input.year);
  let resourcesQuery = client.from("resources")
    .select("id,title,resource_type,year,session,paper_code,variant,processing_status")
    .eq("subject_id", subject.id);
  if (year) resourcesQuery = resourcesQuery.eq("year", year);

  let chunksQuery = client.from("ai_chunks")
    .select("id,resource_id,chunk_index,content,metadata,resources!inner(id,title,resource_type,year,session,paper_code,variant,processing_status)")
    .eq("subject_id", subject.id);
  if (year) chunksQuery = chunksQuery.eq("resources.year", year);
  if (terms.length) chunksQuery = chunksQuery.or(terms.slice(0, 3).map((term) => `content.ilike.%${term}%`).join(","));

  const queryEmbedding = await generateQueryEmbedding(input.message);
  const semanticQuery = client.rpc("match_ai_chunks", {
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_subject_id: subject.id,
    match_count: 12,
    match_threshold: 0.25,
  });
  const [resources, chunks, semantic] = await Promise.all([resourcesQuery.order("year", { ascending: false }).limit(100), chunksQuery.limit(20), semanticQuery]);
  if (resources.error) throw resources.error;
  if (chunks.error) throw chunks.error;
  if (semantic.error) throw semantic.error;
  const keywordSources: SourceResult[] = (chunks.data ?? []).map((chunk) => {
    const resource = Array.isArray(chunk.resources) ? chunk.resources[0] : chunk.resources;
    const reference = `${subject.name}: ${resource?.title ?? "Resource"}${resource?.year ? ` (${resource.year})` : ""}${resource?.paper_code ? ` ${resource.paper_code}` : ""}`;
    return { sourceType: "resource", id: chunk.id, paperId: null, reference, content: chunk.content.slice(0, 5000), metadata: { resourceId: chunk.resource_id, chunkIndex: chunk.chunk_index, title: resource?.title, resourceType: resource?.resource_type, year: resource?.year, session: resource?.session, paperCode: resource?.paper_code, variant: resource?.variant } };
  });
  const semanticSources: SourceResult[] = (semantic.data ?? [])
    .filter((chunk: { metadata: Record<string, unknown> }) => !year || Number(chunk.metadata.year) === year)
    .map((chunk: { id: number; resource_id: number; chunk_index: number; content: string; metadata: Record<string, unknown>; similarity: number }) => ({
    sourceType: "resource",
    id: chunk.id,
    paperId: null,
    reference: `${subject.name}: ${String(chunk.metadata.title ?? "Resource")}${chunk.metadata.year ? ` (${String(chunk.metadata.year)})` : ""}${chunk.metadata.paperCode ? ` ${String(chunk.metadata.paperCode)}` : ""}`,
    content: chunk.content.slice(0, 5000),
    metadata: { ...chunk.metadata, resourceId: chunk.resource_id, chunkIndex: chunk.chunk_index, similarity: chunk.similarity },
    }));
  const seen = new Set<number>();
  const sources = [...semanticSources, ...keywordSources].filter((source) => !seen.has(source.id) && seen.add(source.id)).slice(0, 20);
  return { resources: resources.data ?? [], sources };
}

const STOP_WORDS = new Set([
  "about", "all", "and", "answer", "appeared", "can", "find", "from", "how", "many", "paper", "papers",
  "question", "questions", "show", "the", "this", "what", "which", "with", "year", "physics", "chemistry",
  "biology", "level", "please", "give", "tell", "me", "in", "of", "on", "for", "a", "an",
]);

function searchTerms(message: string) {
  return [...new Set(message.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/))]
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^20\d{2}$/.test(word))
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);
}

function getFilters(message: string, explicitYear?: number | null) {
  const year = (explicitYear ?? Number(message.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0)) || null;
  const paperNumber = Number(message.match(/(?:paper|p)\s*(\d{1,2})\b/i)?.[1] ?? 0) || null;
  const lower = message.toLowerCase();
  const session = lower.includes("may/june") || lower.includes("may june") ? "MAY_JUNE"
    : lower.includes("oct/nov") || lower.includes("oct nov") ? "OCT_NOV"
      : lower.includes("feb/march") || lower.includes("feb march") ? "FEB_MAR" : null;
  return { year, paperNumber, session, terms: searchTerms(message) };
}

async function retrieveSources(client: SupabaseClient, input: z.infer<typeof RequestBody>, subject: { id: number; name: string; code: string }) {
  const { year, paperNumber, session, terms } = getFilters(input.message, input.year);
  const keyword = terms[0];

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
  if (keyword) questionsQuery = questionsQuery.or(`topic.ilike.%${keyword}%,subtopic.ilike.%${keyword}%,question_text.ilike.%${keyword}%,question.ilike.%${keyword}%,extracted_text.ilike.%${keyword}%`);

  let questionCountQuery = client.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", subject.id);
  if (input.selectedPaperId) questionCountQuery = questionCountQuery.eq("paper_id", input.selectedPaperId);
  if (year) questionCountQuery = questionCountQuery.eq("year", year);

  let notesQuery = client.from("notes").select("id,title,topic,content,summary").eq("subject_id", subject.id);
  if (keyword) notesQuery = notesQuery.or(`title.ilike.%${keyword}%,topic.ilike.%${keyword}%,content.ilike.%${keyword}%,summary.ilike.%${keyword}%`);

  let topicsQuery = client.from("topics").select("id,name,slug").eq("subject_id", subject.id);
  if (keyword) topicsQuery = topicsQuery.or(`name.ilike.%${keyword}%,slug.ilike.%${keyword}%`);

  const [papers, questions, topics, notes, questionCount] = await Promise.all([
    papersQuery.limit(20), questionsQuery.limit(200), topicsQuery.limit(30), notesQuery.limit(30), questionCountQuery,
  ]);
  for (const result of [papers, questions, topics, notes, questionCount]) if (result.error) throw result.error;

  const results: SourceResult[] = [];
  for (const row of questions.data ?? []) {
    const paper = Array.isArray(row.papers) ? row.papers[0] : row.papers;
    results.push({
      sourceType: "question", id: row.id, paperId: row.paper_id,
      reference: `${subject.name} ${row.year ?? "unknown year"}, P${paper?.paper_number ?? "?"}, Q${row.question_number ?? "?"}`,
      content: [row.question_text ?? row.question, row.extracted_text].filter(Boolean).join("\n").slice(0, 4000),
      metadata: { topic: row.topic, subtopic: row.subtopic, difficulty: row.difficulty, marks: row.marks, session: paper?.session, variant: paper?.variant },
    });
  }
  for (const row of notes.data ?? []) results.push({ sourceType: "note", id: row.id, paperId: null, reference: `${subject.name} note: ${row.title}`, content: [row.topic, row.summary, row.content].filter(Boolean).join("\n").slice(0, 4000), metadata: { topic: row.topic } });
  for (const row of topics.data ?? []) results.push({ sourceType: "topic", id: row.id, paperId: null, reference: `${subject.name} topic: ${row.name}`, content: row.name, metadata: { slug: row.slug } });
  for (const row of papers.data ?? []) results.push({ sourceType: "paper", id: row.id, paperId: row.id, reference: `${subject.name} ${row.year} ${row.session} P${row.paper_number}${row.variant ? ` v${row.variant}` : ""}`, content: [row.title, row.raw_text].filter(Boolean).join("\n").slice(0, 4000), metadata: { year: row.year, session: row.session, paperNumber: row.paper_number, variant: row.variant, sourceType: row.source_type, ingestionStatus: row.ingestion_status, hasExtractedText: Boolean(row.raw_text) } });

  return { sources: results.slice(0, 80), matchedPapers: papers.data ?? [], matchedQuestions: questions.data ?? [], extractedQuestionCount: questionCount.count ?? 0 };
}

router.post("/ai-assistant", requireUser, async (req, res): Promise<void> => {
  try {
    const parsed = RequestBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid AI request." }); return; }
    if (!isGeminiConfigured()) { res.status(503).json({ error: GEMINI_NOT_CONFIGURED }); return; }

    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const client = createUserClient(token!);
    const input = parsed.data;
    const { data: subject, error: subjectError } = await client.from("subjects").select("id,name,code,level").eq("id", input.subjectId).eq("level", input.level).single();
    if (subjectError || !subject) { res.status(404).json({ error: "Subject not found." }); return; }

    const resourceRetrieval = await retrieveResourceSources(client, input, subject);
    let diagnostics: Record<string, unknown>;
    let retrieved: SourceResult[];
    if (resourceRetrieval.resources.length) {
      const unprocessed = resourceRetrieval.resources.every((resource) => resource.processing_status !== "processed");
      diagnostics = { matchedResources: resourceRetrieval.resources, matchedChunks: resourceRetrieval.sources.length };
      if (unprocessed) { res.json({ answer: "This resource is uploaded but not processed yet. Please process it first.", sources: [], ...(input.debug ? { retrievedResults: [], diagnostics } : {}) }); return; }
      retrieved = resourceRetrieval.sources;
    } else {
      const retrieval = await retrieveSources(client, input, subject);
      const onlyUnprocessedPapers = retrieval.matchedPapers.length > 0 && retrieval.extractedQuestionCount === 0;
      diagnostics = { matchedPapers: retrieval.matchedPapers, extractedQuestionCount: retrieval.extractedQuestionCount, matchedQuestionRows: retrieval.matchedQuestions };
      if (onlyUnprocessedPapers) { res.json({ answer: UNPROCESSED_PAPER_MESSAGE, sources: [], ...(input.debug ? { retrievedResults: [], diagnostics } : {}) }); return; }
      retrieved = retrieval.sources;
    }
    if (retrieved.length === 0) { res.json({ answer: MISSING_SOURCE_MESSAGE, sources: [], ...(input.debug ? { retrievedResults: [], diagnostics } : {}) }); return; }

    const context = retrieved.map((source, index) => `[Source ${index + 1}] ${source.reference}\nMetadata: ${JSON.stringify(source.metadata)}\n${source.content}`).join("\n\n");
    let answer: string;
    try {
      answer = await generateGroundedAnswer(
        `You are the Parhai.com ${subject.name} assistant. Use only the supplied Supabase records. Never use outside knowledge or invent paper data. Cite factual claims as [Source N]. If the records do not answer the question, reply exactly: ${MISSING_SOURCE_MESSAGE}`,
        `Student question: ${input.message}\n\nSupabase records:\n${context}`
      );
    } catch (geminiError) {
      res.status(503).json({ error: geminiError instanceof Error ? geminiError.message : "Gemini request failed.", ...(input.debug ? { retrievedResults: retrieved, diagnostics } : {}) });
      return;
    }

    const sources = retrieved.map((source, index) => ({ chunkId: source.id, sourceType: source.sourceType, paperId: source.paperId, year: source.metadata.year ?? null, session: source.metadata.session ?? null, paperNumber: source.metadata.paperNumber ?? null, questionNumber: source.sourceType === "question" ? source.reference.split("Q").pop() ?? null : null, reference: `[Source ${index + 1}] ${source.reference}` }));
    const { error: historyError } = await client.from("chat_messages").insert([{ user_id: res.locals.user.id, subject_id: subject.id, paper_id: input.selectedPaperId ?? null, role: "user", content: input.message, sources: [] }, { user_id: res.locals.user.id, subject_id: subject.id, paper_id: input.selectedPaperId ?? null, role: "assistant", content: answer, sources }]);
    if (historyError) throw historyError;

    res.json({ answer, sources, ...(input.debug ? { retrievedResults: retrieved, diagnostics } : {}) });
  } catch (error) {
    req.log.error({ error }, "Gemini assistant request failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "AI assistant request failed." });
  }
});

export default router;
