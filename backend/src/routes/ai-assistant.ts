import { Router, type IRouter } from "express";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAiAnswer, generateQueryEmbedding, getAiConfigurationError, getAiStatus, isAiConfigured } from "../lib/ai-service";
import { classifyQueryTopicId, keywordClassifyTopicId, parentTopicId, hasTaxonomy } from "../services/taxonomy-classifier";
import { logRetrievalTelemetry } from "../services/intelligence-telemetry";
import { logInteraction, recordLedgerVerification } from "../services/interaction-ledger";
import { createUserClient } from "../lib/supabase";
import { requireUser } from "../middleware/auth";
import { aiLimiter } from "../middleware/rate-limit";
import { detectRequestedTopic, expandSearchTerms, finalizeGroundedAnswer, formatCitation, formatQuestionResultSummary, rankEvidence } from "../services/rag-utils";
import { assistantModeFor, cambridgeTeacherName, finalizeTeacherAnswer, requestedOutsideSubject } from "../services/teacher-mode";
import { screenshotMode } from "../services/question-screenshots";

const router: IRouter = Router();
const MISSING_SOURCE_MESSAGE = "I could not find this in the uploaded papers yet.";
const UNPROCESSED_PAPER_MESSAGE = "This paper is uploaded but not processed yet. Please process it first.";

// Phase 1 (F1): kill switch for the legacy Gen-2 retrieval path. Default ON so
// behaviour is unchanged while telemetry measures whether legacy sources ever win
// a citation. Set ENABLE_LEGACY_RETRIEVAL=false to disable once data proves it dead.
const LEGACY_RETRIEVAL_ENABLED = process.env.ENABLE_LEGACY_RETRIEVAL !== "false";
const EMPTY_LEGACY_RETRIEVAL = { sources: [] as SourceResult[], matchedPapers: [] as any[], matchedQuestions: [] as any[], extractedQuestionCount: 0 };

const RequestBody = z.object({
  message: z.string().trim().min(1).max(4000),
  subjectId: z.coerce.number().int().positive(),
  subjectName: z.string().trim().min(1).max(120).optional(),
  level: z.enum(["O_LEVEL", "A_LEVEL"]),
  board: z.string().trim().min(1).max(80).optional(),
  selectedPaperId: z.coerce.number().int().positive().nullable().optional(),
  year: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  answerLength: z.enum(["quick", "teacher", "full"]).optional().default("teacher"),
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

function normalizedQuestionKey(source: SourceResult) {
  const text = String(source.metadata.questionText ?? source.content)
    .toLowerCase().replace(/\[[0-9]+\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const words = text.split(" ").filter(Boolean).slice(0, 45).join(" ");
  return [words, source.metadata.topic ?? "", source.metadata.subtopic ?? "", source.metadata.marks ?? ""].join("|");
}

function deduplicateQuestions(sources: SourceResult[]) {
  const seen = new Set<string>();
  const unique: SourceResult[] = [];
  let removed = 0;
  for (const source of sources) {
    const key = normalizedQuestionKey(source);
    if (seen.has(key)) { removed += 1; continue; }
    seen.add(key);
    unique.push(source);
  }
  return { unique, removed };
}

function questionSearchAnswer(subject: { name: string; code: string }, sources: SourceResult[], message: string) {
  const questions = sources.filter((source) => source.sourceType === "question");
  const requestedTopic = expandSearchTerms(message).find((term) =>
    !["hard", "hardest", "difficult", "challenging"].includes(term)) ?? "matching";
  const lines = questions.map((source, index) => {
    const metadata = source.metadata;
    const session = String(metadata.session ?? "Session unavailable").replace("_", " ");
    const topic = [metadata.topic, metadata.subtopic].filter(Boolean).join(" · ") || "Topic unavailable";
    return `${index + 1}. ${metadata.year ?? "Year unavailable"} · ${session} · Paper ${metadata.paperCode ?? metadata.paperNumber ?? "—"} · Variant ${metadata.variant ?? "—"} · Question ${metadata.questionNumber ?? "—"} — ${topic} — ${metadata.difficulty ?? "MEDIUM"} — ${metadata.marks ?? "—"} marks [S${index + 1}]`;
  });
  const tip = /\benergy|work|power|efficiency\b/i.test(message)
    ? "For Energy questions, write the correct equation first, substitute with units, and check whether the question asks for energy transferred, power, or efficiency."
    : "Start with the highest-mark questions, identify the command word, and show enough working for every available method mark.";
  return [
    "### Direct answer",
    `I found ${questions.length} strong ${requestedTopic}-related question${questions.length === 1 ? "" : "s"} from ${subject.name} ${subject.code}.`,
    "### Best matches",
    ...lines,
    "### Teacher tip",
    tip,
  ].join("\n");
}

async function retrieveResourceSources(client: SupabaseClient, input: z.infer<typeof RequestBody>, subject: { id: number; name: string; code: string }) {
  const { year, yearFrom, yearTo, paperNumber, session, difficulty, terms } = getFilters(input.message, input.year);
  const requestedTopic = detectRequestedTopic(input.message, subject.code);

  // ── Taxonomy-first topic resolution (any subject with a registered taxonomy) ─
  const subjectHasTaxonomy = hasTaxonomy(subject.code);
  let taxonomyTopicId: string | null = null;
  let topicMethod: "ai" | "keyword" | "none" = "none";
  if (subjectHasTaxonomy) {
    // Try AI classifier first; fall back to keyword match (fast, no network).
    const aiTopic = await classifyQueryTopicId(input.message, subject.code).catch(() => null);
    if (aiTopic) { taxonomyTopicId = aiTopic; topicMethod = "ai"; }
    else {
      const kwTopic = keywordClassifyTopicId(input.message, subject.code);
      if (kwTopic) { taxonomyTopicId = kwTopic; topicMethod = "keyword"; }
    }
  }
  let resourcesQuery = client.from("resources")
    .select("id,title,resource_type,year,session,paper_code,variant,processing_status")
    .eq("subject_id", subject.id).eq("is_approved", true);
  if (year) resourcesQuery = resourcesQuery.eq("year", year);

  let chunksQuery = client.from("ai_chunks")
    .select("id,resource_id,chunk_index,content,metadata,resources!inner(id,title,resource_type,year,session,paper_code,variant,processing_status,is_approved)")
    .eq("subject_id", subject.id).eq("resources.is_approved", true);
  if (year) chunksQuery = chunksQuery.eq("resources.year", year);
  if (terms.length) chunksQuery = chunksQuery.or(terms.slice(0, 3).map((term) => `content.ilike.%${term}%`).join(","));

  let indexedQuery = client.from("question_index")
    .select("id,resource_id,legacy_source_id,question_number,topic,subtopic,difficulty,marks,total_marks,display_question_text,clean_question_text,question_text,answer_text,question_screenshot_url,screenshot_status,source_page,bbox,confidence,needs_review,text_quality_status,student_verified,marking_scheme_link_status,source_file,year,session,paper_code,variant,resources!inner(id,title,bucket,storage_path,related_resource_id,is_approved)")
    .eq("subject_id", subject.id).eq("resources.is_approved", true)
    // Eligibility = usable extracted text, NOT topic certainty or complete metadata.
    // Topic-uncertain questions still surface (carrying needs_review) instead of being hidden.
    .in("text_quality_status", ["good", "acceptable"]).not("clean_question_text", "is", null);
  if (year) indexedQuery = indexedQuery.eq("year", year);
  if (yearFrom) indexedQuery = indexedQuery.gte("year", yearFrom);
  if (yearTo) indexedQuery = indexedQuery.lte("year", yearTo);
  if (paperNumber) indexedQuery = indexedQuery.eq("paper_code", String(paperNumber));
  if (session) indexedQuery = indexedQuery.eq("session", session);
  if (difficulty) indexedQuery = indexedQuery.eq("difficulty", difficulty);
  // ── Topic-first filtering ──────────────────────────────────────────────────
  // For physics: try taxonomy_topic_id filter; expand to parent if too narrow.
  // For non-physics or when no topic resolved: fall through to ILIKE.
  let taxonomyFiltered = false;
  let retrievalStrategy: "taxonomy_exact" | "taxonomy_parent" | "topic_ilike" | "keyword_ilike" | "semantic_only" = "semantic_only";
  if (subjectHasTaxonomy && taxonomyTopicId) {
    const exactQuery = indexedQuery.eq("taxonomy_topic_id", taxonomyTopicId);
    const { count: exactCount, error: countErr } = await client
      .from("question_index")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", subject.id)
      .in("text_quality_status", ["good", "acceptable"])
      .not("clean_question_text", "is", null)
      .eq("taxonomy_topic_id", taxonomyTopicId);
    if (!countErr && (exactCount ?? 0) >= 3) {
      indexedQuery = exactQuery;
      taxonomyFiltered = true;
      retrievalStrategy = "taxonomy_exact";
    } else {
      // Expand to sibling subtopics under the same parent section.
      const parentId = parentTopicId(taxonomyTopicId);
      if (parentId) {
        indexedQuery = indexedQuery.like("taxonomy_topic_id", `${parentId}.%`);
        taxonomyFiltered = true;
        retrievalStrategy = "taxonomy_parent";
      }
    }
  }

  if (!taxonomyFiltered) {
    if (requestedTopic) {
      indexedQuery = requestedTopic.topic === "Energy"
        ? indexedQuery.or("topic.ilike.%Energy%,topic.ilike.%Work Energy and Power%")
        : indexedQuery.ilike("topic", requestedTopic.topic);
      if (requestedTopic.subtopics.length) {
        indexedQuery = indexedQuery.or([
          ...requestedTopic.subtopics.map((subtopic) => `subtopic.ilike.%${subtopic}%`),
          ...requestedTopic.keywords.map((keyword) => `clean_question_text.ilike.%${keyword}%`),
        ].join(","));
      }
      retrievalStrategy = "topic_ilike";
    } else if (terms.length) {
      indexedQuery = indexedQuery.or(terms.slice(0, 4).flatMap((term) => [`topic.ilike.%${term}%`, `subtopic.ilike.%${term}%`, `clean_question_text.ilike.%${term}%`]).join(","));
      retrievalStrategy = "keyword_ilike";
    }
  }
  const [resources, chunks, indexed, topicMap] = await Promise.all([
    resourcesQuery.order("year", { ascending: false }).limit(100),
    chunksQuery.limit(20),
    indexedQuery.limit(100),
    client.from("topic_maps").select("id", { count: "exact", head: true }).eq("subject_code", subject.code).eq("status", "approved"),
  ]);
  let semantic: { data: any[] | null; error: { message?: string } | null } = { data: [], error: null };
  let semanticQ: { data: any[] | null; error: { message?: string } | null } = { data: [], error: null };
  if (isAiConfigured()) {
    try {
      // Embed the query ONCE and share it across both vector searches (cost discipline).
      const queryEmbedding = await generateQueryEmbedding(input.message);
      const embStr = `[${queryEmbedding.join(",")}]`;
      // Topic-first semantic search over clean questions (F18): filter by the resolved
      // taxonomy topic before vector ranking. Exact subtopic when confident, parent
      // section when expanded, unfiltered otherwise (still semantic over questions).
      const matchTopicId = retrievalStrategy === "taxonomy_exact" ? taxonomyTopicId : null;
      const matchPrefix = retrievalStrategy === "taxonomy_parent" && taxonomyTopicId ? `${parentTopicId(taxonomyTopicId)}.%` : null;
      [semantic, semanticQ] = await Promise.all([
        client.rpc("match_ai_chunks", { query_embedding: embStr, match_subject_id: subject.id, match_count: 12, match_threshold: 0.12 }),
        client.rpc("match_questions", { query_embedding: embStr, match_subject_id: subject.id, match_count: 12, match_threshold: 0.15, match_taxonomy_topic_id: matchTopicId, match_taxonomy_prefix: matchPrefix }),
      ]);
    } catch {
      // Keyword and exact question_index retrieval remain available.
    }
  }
  if (resources.error) throw resources.error;
  if (chunks.error) throw chunks.error;
  if (semantic.error) throw semantic.error;
  if (semanticQ.error) throw semanticQ.error;
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
  // Topic-filtered semantic question hits (F18) — same shape as keyword question hits.
  const semanticQuestionSources: SourceResult[] = (semanticQ.data ?? [])
    .filter((row: { year: number | null }) => !year || Number(row.year) === year)
    .map((row: any) => ({
      sourceType: "question" as const,
      id: row.id,
      paperId: null,
      reference: formatCitation(subject, { sourceFile: row.source_file, year: row.year, session: row.session, paperCode: row.paper_code, variant: row.variant, questionNumber: row.question_number }),
      content: `Question: ${row.clean_question_text}${row.answer_text ? `\nMarking scheme answer: ${row.answer_text}` : ""}`.slice(0, 5000),
      metadata: { resourceId: row.resource_id, questionNumber: row.question_number, topic: row.topic, subtopic: row.subtopic, taxonomyTopicId: row.taxonomy_topic_id, confidence: row.confidence, needsReview: row.needs_review, difficulty: row.difficulty, marks: row.total_marks ?? row.marks, questionText: row.display_question_text ?? row.clean_question_text, answerText: row.answer_text, similarity: row.similarity, screenshotUrl: null, screenshotStatus: "not_generated", sourceFile: row.source_file, year: row.year, session: row.session, paperCode: row.paper_code, variant: row.variant },
    }));
  const rawQuestionSources: SourceResult[] = (indexed.data ?? []).map((row) => ({
    sourceType: "question",
    id: row.id,
    paperId: null,
    reference: formatCitation(subject, { sourceFile: row.source_file, year: row.year, session: row.session, paperCode: row.paper_code, variant: row.variant, questionNumber: row.question_number }),
    content: `Question: ${row.clean_question_text ?? row.display_question_text ?? row.question_text}${row.answer_text ? `\nMarking scheme answer: ${row.answer_text}` : ""}`.slice(0, 5000),
    metadata: { resourceId: row.resource_id, legacyQuestionId: row.legacy_source_id, questionNumber: row.question_number, topic: row.topic, subtopic: row.subtopic, confidence: row.confidence, needsReview: row.needs_review, difficulty: row.difficulty, marks: row.total_marks ?? row.marks, questionText: row.display_question_text ?? row.clean_question_text ?? row.question_text, answerText: row.answer_text, screenshotUrl: screenshotMode() === "on_demand" ? null : row.question_screenshot_url, screenshotStatus: screenshotMode() === "on_demand" ? "not_generated" : row.screenshot_status, sourcePage: row.source_page, bbox: row.bbox, filePath: (Array.isArray(row.resources) ? row.resources[0] : row.resources)?.storage_path, sourceFile: row.source_file, year: row.year, session: row.session, paperCode: row.paper_code, variant: row.variant },
  }));
  // Keyword hits first so their richer metadata (screenshots, bbox, file path) wins
  // over the leaner semantic hit when the two collapse to the same question.
  const deduplicated = deduplicateQuestions([...rawQuestionSources, ...semanticQuestionSources]);
  const questionSources = deduplicated.unique;
  const seen = new Set<string>();
  const uniqueSources = [...questionSources, ...semanticSources, ...keywordSources].filter((source) => {
    const key = `${source.sourceType}:${source.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sources = rankEvidence(uniqueSources, terms, 12);
  const topSimilarity = [...semanticSources, ...semanticQuestionSources].reduce((max, s) => Math.max(max, Number(s.metadata.similarity ?? 0)), 0);
  return {
    resources: resources.data ?? [], sources,
    indexedQuestionCount: indexed.data?.length ?? 0,
    duplicatesRemoved: deduplicated.removed, topicMapCount: topicMap.count ?? 0,
    taxonomyTopicId, topicMethod, retrievalStrategy, topSimilarity,
  };
}

function getFilters(message: string, explicitYear?: number | null) {
  const year = (explicitYear ?? Number(message.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0)) || null;
  const years = [...message.matchAll(/\b((?:19|20)\d{2})\b/g)].map((match) => Number(match[1]));
  const lastYears = Number(message.match(/last\s+(\d{1,2})\s+years?/i)?.[1] ?? 0);
  const currentYear = new Date().getUTCFullYear();
  const yearFrom = years.length >= 2 ? Math.min(...years) : lastYears ? currentYear - lastYears + 1 : null;
  const yearTo = years.length >= 2 ? Math.max(...years) : lastYears ? currentYear : null;
  const paperNumber = Number(message.match(/(?:paper|p)\s*(\d{1,2})\b/i)?.[1] ?? 0) || null;
  const lower = message.toLowerCase();
  const session = lower.includes("may/june") || lower.includes("may june") ? "MAY_JUNE"
    : lower.includes("oct/nov") || lower.includes("oct nov") ? "OCT_NOV"
      : lower.includes("feb/march") || lower.includes("feb march") ? "FEB_MAR" : null;
  const rankedDifficultyRequest = /\b(hardest|difficult|challenging)\b/i.test(message);
  const difficulty = !rankedDifficultyRequest && /\bhard\b/i.test(message) ? "HARD" : /\beasy\b/i.test(message) ? "EASY" : /\bmedium\b/i.test(message) ? "MEDIUM" : null;
  return { year: years.length >= 2 || lastYears ? null : year, yearFrom, yearTo, paperNumber, session, difficulty, terms: expandSearchTerms(message) };
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

router.post("/ai-assistant", requireUser, aiLimiter, async (req, res): Promise<void> => {
  const startedAt = Date.now();
  try {
    const parsed = RequestBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid AI request." }); return; }
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const client = createUserClient(token!);
    const input = parsed.data;
    const { data: subject, error: subjectError } = await client.from("subjects").select("id,name,code,level,board").eq("id", input.subjectId).eq("level", input.level).single();
    if (subjectError || !subject) { res.status(404).json({ error: "Subject not found." }); return; }
    if (input.subjectName && input.subjectName.toLowerCase() !== subject.name.toLowerCase()) { res.status(400).json({ error: "Subject scope does not match the selected subject." }); return; }
    if (input.board && input.board.toLowerCase() !== subject.board.toLowerCase()) { res.status(400).json({ error: "Board scope does not match the selected subject." }); return; }
    const mode = assistantModeFor(input.message);
    const questionListRequest = /\b(give|show|find|list|make|generate)\b.*\b(questions?|worksheet|practice|paper\s*\d)\b/i.test(input.message);
    const teacherName = cambridgeTeacherName(subject.name);
    if (requestedOutsideSubject(input.message, subject.name)) {
      res.json({ answer: `I’m your ${teacherName}, so I can only help with ${subject.name} in this workspace. Please open the correct subject page for that question.`, sources: [], ...(input.debug ? { diagnostics: { mode, activeSubject: subject.name, blockedOutsideSubject: true }, retrievedResults: [] } : {}) });
      return;
    }

    const [resourceRetrieval, legacyRetrieval] = await Promise.all([
      retrieveResourceSources(client, input, subject),
      LEGACY_RETRIEVAL_ENABLED ? retrieveSources(client, input, subject) : Promise.resolve(EMPTY_LEGACY_RETRIEVAL),
    ]);
    // Tag legacy-origin sources so telemetry can measure whether they ever win a citation (F1).
    for (const source of legacyRetrieval.sources) source.metadata.__origin = "legacy";
    const legacySourcesReturned = legacyRetrieval.sources.length;
    const diagnostics: Record<string, unknown> = {
      matchedResources: resourceRetrieval.resources,
      matchedChunks: resourceRetrieval.sources.length,
      indexedQuestions: resourceRetrieval.indexedQuestionCount,
      duplicatesRemoved: resourceRetrieval.duplicatesRemoved,
      topicMapCount: resourceRetrieval.topicMapCount,
      matchedPapers: legacyRetrieval.matchedPapers,
      extractedQuestionCount: legacyRetrieval.extractedQuestionCount,
      matchedQuestionRows: legacyRetrieval.matchedQuestions,
      mode,
      teacher: teacherName,
    };
    const combined = [...resourceRetrieval.sources, ...legacyRetrieval.sources];
    const seenEvidence = new Set<string>();
    const rankedRetrieved = rankEvidence(combined.filter((source) => {
      const key = `${source.sourceType}:${source.metadata.legacyQuestionId ?? source.metadata.resourceId ?? source.paperId ?? source.id}:${source.metadata.questionNumber ?? ""}:${source.content.slice(0, 120)}`;
      if (seenEvidence.has(key)) return false;
      seenEvidence.add(key);
      return true;
    }), getFilters(input.message, input.year).terms, 12);
    const retrieved = questionListRequest
      ? rankedRetrieved.filter((source) => source.sourceType === "question").slice(0, 6)
      : rankedRetrieved;
    // Best-effort retrieval telemetry (never blocks or breaks the response).
    const recordTelemetry = (providerOk: boolean, sourceCount: number, questionCount: number, legacyCited = 0) =>
      void logRetrievalTelemetry(client, {
        userId: res.locals.user.id,
        subjectId: subject.id,
        subjectCode: subject.code,
        queryText: input.message,
        mode,
        resolvedTopicId: resourceRetrieval.taxonomyTopicId,
        topicMethod: resourceRetrieval.topicMethod,
        retrievalStrategy: resourceRetrieval.retrievalStrategy,
        sourcesReturned: sourceCount,
        questionSources: questionCount,
        topSimilarity: resourceRetrieval.topSimilarity || null,
        answerLength: input.answerLength,
        providerOk,
        latencyMs: Date.now() - startedAt,
        legacySourcesReturned,
        legacySourcesCited: legacyCited,
      });
    const onlyUnprocessedResources = resourceRetrieval.resources.length > 0 && resourceRetrieval.resources.every((resource) => resource.processing_status !== "processed");
    const onlyUnprocessedPapers = legacyRetrieval.matchedPapers.length > 0 && legacyRetrieval.extractedQuestionCount === 0;
    if (mode === "rag" && !retrieved.length && (onlyUnprocessedResources || onlyUnprocessedPapers)) {
      res.json({ answer: onlyUnprocessedResources ? "This resource is uploaded but not processed yet. Please process it first." : UNPROCESSED_PAPER_MESSAGE, sources: [], ...(input.debug ? { retrievedResults: [], diagnostics } : {}) });
      return;
    }
    if (mode === "rag" && retrieved.length === 0) {
      const subjectResources = resourceRetrieval.resources;
      const questionPapers = subjectResources.filter((resource) => resource.resource_type === "PAST_PAPER");
      const markingSchemes = subjectResources.filter((resource) => resource.resource_type === "MARKING_SCHEME");
      const failedPapers = questionPapers.filter((resource) => resource.processing_status === "failed");
      const statusMessages = [
        resourceRetrieval.indexedQuestionCount === 0 && questionPapers.length ? "Maths papers are uploaded but not indexed yet." : null,
        resourceRetrieval.topicMapCount === 0 && subject.code === "4024" ? "Maths topic map missing." : null,
        failedPapers.length && markingSchemes.length ? `${failedPapers.length} Maths question paper${failedPapers.length === 1 ? " has" : "s have"} failed processing while marking schemes are available.` : null,
      ].filter(Boolean);
      recordTelemetry(true, 0, 0);
      res.json({ answer: statusMessages.join(" ") || MISSING_SOURCE_MESSAGE, sources: [], ...(input.debug ? { retrievedResults: [], diagnostics } : {}) });
      return;
    }

    const context = retrieved.map((source, index) => `[S${index + 1}] ${source.reference}\nMetadata: ${JSON.stringify(source.metadata)}\n${source.content}`).join("\n\n");
    const recentHistory = (input.chatHistory ?? []).slice(-8).map((message) => `${message.role === "user" ? "Student" : "Assistant"}: ${message.content}`).join("\n");
    let answer: string;
    try {
      if (!isAiConfigured()) throw new Error(getAiConfigurationError() ?? "AI provider is not configured.");
      const levelLabel = subject.level === "O_LEVEL" ? "O Level" : "A Level";
      const lengthRule = input.answerLength === "quick"
        ? "Keep the explanation to 2-4 concise sentences."
        : input.answerLength === "full"
          ? "Provide a complete exam breakdown with method, marking logic, common errors, and practice order."
          : "Keep the default answer concise. Use only: Direct answer; Questions found / breakdown; Teacher tip. Do not add long definitions, common mistakes, or related topics unless requested.";
      const modeRules = mode === "rag"
        ? `RAG MODE — use only the supplied Supabase evidence. Cite every factual claim with [S#]. Never invent a paper, question, mark, date, answer, or citation. If evidence is insufficient, reply exactly: ${MISSING_SOURCE_MESSAGE}`
        : mode === "hybrid"
          ? "HYBRID MODE — teach using accurate Cambridge subject knowledge, then use relevant uploaded evidence as support. Cite only claims derived from uploaded evidence with [S#]. Recommend real related uploaded questions when available; never invent one."
        : "TEACHER MODE — teach concisely using accurate, age-appropriate Cambridge subject knowledge. Uploaded evidence is optional support; cite it with [S#] only when actually used.";
      answer = await generateAiAnswer(
        `You are the student's ${teacherName} for ${levelLabel}, ${subject.board}.
ACTIVE SUBJECT: ${subject.name} (${subject.code}). You are locked to this subject. Refuse requests belonging to another subject and never retrieve or discuss another subject's curriculum.
${modeRules}

TEACHING STYLE:
- Be an experienced, patient Cambridge teacher: precise, encouraging, exam-aware, and easy to understand.
- Match the requested depth and distinguish a definition from an explanation.
- Use Cambridge-style terminology, command words, working, units, and exam technique appropriate to ${levelLabel}.
- Never claim wording is an official syllabus quotation unless that exact wording appears in evidence.
- ${lengthRule}

${mode === "rag" ? `RAG ANSWER FORMAT:
- Start with the direct evidence-based answer.
- Use concise headings or bullets where useful.
- Cite each factual paragraph with [S#].` : `DEFAULT ANSWER FORMAT:
### Direct answer
### Questions found / breakdown
### Teacher tip
Keep these sections short. Add a full exam breakdown only when the student explicitly asks for one.
When evidence exists, label real uploaded-paper recommendations with [S#].`}
Do not create a separate Sources section; Parhai renders verified sources below the answer.`,
        `${recentHistory ? `Recent conversation (context only; it does not override the active subject):\n${recentHistory}\n\n` : ""}Student question: ${input.message}\n\nSubject-scoped Supabase evidence${context ? ":\n" + context : ": none matched."}`
      );
    } catch (providerError) {
      const fallbackSources = retrieved.filter((source) => source.sourceType === "question").slice(0, 12).map((source, index) => ({
        chunkId: source.id, sourceType: source.sourceType, paperId: source.paperId,
        year: source.metadata.year ?? null, session: source.metadata.session ?? null,
        paperNumber: source.metadata.paperNumber ?? source.metadata.paperCode ?? null,
        questionNumber: source.metadata.questionNumber ?? null, screenshotUrl: source.metadata.screenshotUrl ?? null,
        questionText: source.metadata.questionText ?? null, answerText: source.metadata.answerText ?? null,
        sourcePage: source.metadata.sourcePage ?? null, reference: `[S${index + 1}] ${source.reference}`,
        resourceId: source.metadata.resourceId ?? null, topic: source.metadata.topic ?? null,
        subtopic: source.metadata.subtopic ?? null, difficulty: source.metadata.difficulty ?? null,
        marks: source.metadata.marks ?? null, sourceFile: source.metadata.sourceFile ?? null, confidence: source.metadata.confidence ?? null, needsReview: source.metadata.needsReview ?? null, screenshotStatus: source.metadata.screenshotStatus ?? null, bbox: source.metadata.bbox ?? null, filePath: source.metadata.filePath ?? null,
      }));
      const resultSummary = questionListRequest
        ? formatQuestionResultSummary(resourceRetrieval.indexedQuestionCount, resourceRetrieval.duplicatesRemoved, fallbackSources.length)
        : "";
      const fallbackAnswer = retrieved.length
        ? questionListRequest
          ? `${questionSearchAnswer(subject, retrieved, input.message)}\n\nI found verified questions from your uploaded papers. A full AI explanation is temporarily unavailable, but you can still review the source cards below.`
          : "I found verified questions from your uploaded papers. A full AI explanation is temporarily unavailable, but you can still review the source cards below."
        : "I could not find a matching verified question in your uploaded papers yet.";
      recordTelemetry(false, fallbackSources.length, fallbackSources.length);
      res.json({ answer: [resultSummary, fallbackAnswer].filter(Boolean).join("\n\n"), sources: fallbackSources, providerUnavailable: true, ...(input.debug ? { providerError: providerError instanceof Error ? providerError.message : "AI provider request failed.", retrievedResults: retrieved, diagnostics } : {}) });
      return;
    }

    const grounded = mode === "rag"
      ? finalizeGroundedAnswer(answer, retrieved.length, MISSING_SOURCE_MESSAGE)
      : finalizeTeacherAnswer(answer, retrieved.length, mode);
    const cited = new Set(grounded.citedIndexes);
    // Measure whether the legacy Gen-2 path actually won any citation (F1).
    const legacyCited = retrieved.filter((source, index) => cited.has(index + 1) && source.metadata.__origin === "legacy").length;
    const sources = retrieved.flatMap((source, index) => (cited.has(index + 1) || (questionListRequest && source.sourceType === "question")) ? [{ chunkId: source.id, sourceType: source.sourceType, paperId: source.paperId, resourceId: source.metadata.resourceId ?? null, year: source.metadata.year ?? null, session: source.metadata.session ?? null, paperNumber: source.metadata.paperNumber ?? source.metadata.paperCode ?? null, variant: source.metadata.variant ?? null, questionNumber: source.metadata.questionNumber ?? null, screenshotUrl: source.metadata.screenshotUrl ?? null, screenshotStatus: source.metadata.screenshotStatus ?? null, questionText: source.metadata.questionText ?? null, answerText: source.metadata.answerText ?? null, sourcePage: source.metadata.sourcePage ?? null, bbox: source.metadata.bbox ?? null, filePath: source.metadata.filePath ?? null, topic: source.metadata.topic ?? null, subtopic: source.metadata.subtopic ?? null, confidence: source.metadata.confidence ?? null, needsReview: source.metadata.needsReview ?? null, difficulty: source.metadata.difficulty ?? null, marks: source.metadata.marks ?? null, sourceFile: source.metadata.sourceFile ?? null, reference: `[S${index + 1}] ${source.reference}` }] : []);
    const { error: historyError } = await client.from("chat_messages").insert([{ user_id: res.locals.user.id, subject_id: subject.id, paper_id: input.selectedPaperId ?? null, role: "user", content: input.message, sources: [] }, { user_id: res.locals.user.id, subject_id: subject.id, paper_id: input.selectedPaperId ?? null, role: "assistant", content: grounded.answer, sources }]);
    if (historyError) throw historyError;
    const { error: logError } = await client.from("ai_chat_logs").insert({ user_id: res.locals.user.id, subject_id: subject.id, user_question: input.message, ai_answer: grounded.answer, sources_used: sources });
    if (logError) req.log.warn({ logError }, "Could not save AI audit log");

    const displayedQuestions = sources.filter((source) => source.sourceType === "question").length;
    const resultSummary = questionListRequest
      ? formatQuestionResultSummary(resourceRetrieval.indexedQuestionCount, resourceRetrieval.duplicatesRemoved, displayedQuestions)
      : "";
    const presentedAnswer = questionListRequest ? questionSearchAnswer(subject, retrieved, input.message) : grounded.answer;
    recordTelemetry(true, sources.length, displayedQuestions, legacyCited);
    // Interaction Ledger (Phase A): capture this grounded generation as a training
    // candidate, tagged with model provenance. Returns an id the client attaches
    // feedback to. Best-effort: a null id never breaks the response.
    const ai = getAiStatus();
    const interactionId = await logInteraction(client, {
      userId: res.locals.user.id,
      subjectId: subject.id,
      subjectCode: subject.code,
      mode,
      modelProvider: ai.provider,
      modelName: ai.model,
      queryText: input.message,
      resolvedTopicId: resourceRetrieval.taxonomyTopicId,
      retrievalStrategy: resourceRetrieval.retrievalStrategy,
      evidence: retrieved.slice(0, 12).map((source) => ({
        sourceType: source.sourceType,
        id: source.id,
        reference: source.reference,
        similarity: typeof source.metadata.similarity === "number" ? source.metadata.similarity : null,
        questionNumber: (source.metadata.questionNumber as string | undefined) ?? null,
        topic: (source.metadata.topic as string | undefined) ?? null,
      })),
      answerText: grounded.answer,
      citations: sources.map((source) => source.reference),
      answerLength: input.answerLength,
      latencyMs: Date.now() - startedAt,
    });
    res.json({ answer: [resultSummary, presentedAnswer].filter(Boolean).join("\n\n"), sources, interactionId, ...(input.debug ? { retrievedResults: retrieved, diagnostics } : {}) });
  } catch (error) {
    req.log.error({ error }, "AI assistant request failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "AI assistant request failed." });
  }
});

const FeedbackBody = z.object({
  telemetryId: z.coerce.number().int().positive().nullable().optional(),
  ledgerId: z.coerce.number().int().positive().nullable().optional(),
  subjectId: z.coerce.number().int().positive(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  reason: z.enum(["helpful", "wrong_topic", "hallucinated", "no_sources", "incomplete", "other"]).optional(),
  comment: z.string().trim().max(2000).optional(),
});

/** Student feedback on an AI answer — powers the self-learning / quality loop. */
router.post("/ai/feedback", requireUser, async (req, res): Promise<void> => {
  try {
    const parsed = FeedbackBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid feedback." }); return; }
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const client = createUserClient(token!);
    const { telemetryId, ledgerId, subjectId, rating, reason, comment } = parsed.data;
    const { error } = await client.from("ai_answer_feedback").insert({
      telemetry_id: telemetryId ?? null,
      ledger_id: ledgerId ?? null,
      user_id: res.locals.user.id,
      subject_id: subjectId,
      rating,
      reason: reason ?? null,
      comment: comment ?? null,
    });
    if (error) { res.status(500).json({ error: error.message }); return; }
    // Promote the ledger row's verification from the student's rating (Phase A→B loop).
    if (ledgerId) await recordLedgerVerification(client, ledgerId, rating === 1 ? "student_positive" : "student_negative");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not save feedback." });
  }
});

export default router;
