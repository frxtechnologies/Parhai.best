import { Router, type IRouter } from "express";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateAiAnswer,
  generateQueryEmbedding,
  getAiConfigurationError,
  isAiConfigured,
} from "../lib/ai-service";
import { createUserClient } from "../lib/supabase";
import { requireUser } from "../middleware/auth";
import {
  detectRequestedTopic,
  expandSearchTerms,
  finalizeGroundedAnswer,
  formatCitation,
  formatQuestionResultSummary,
  rankEvidence,
} from "../services/rag-utils";
import {
  assistantModeFor,
  cambridgeTeacherName,
  finalizeTeacherAnswer,
  requestedOutsideSubject,
} from "../services/teacher-mode";
import { screenshotMode } from "../services/question-screenshots";
import { getTopicContext } from "../services/cambridge-context";
import { createExamEngine, detectExamIntent, detectSubjectCode, type ExamFilters } from "../services/exam-engine";
import {isOfficialQuestionAnswer} from "../services/marking-scheme-intelligence";
import {parseStudentPromptToQuery,validateSourceAgainstParsedQuery} from "../services/source-grounded-query";

const router: IRouter = Router();
const MISSING_SOURCE_MESSAGE =
  "I could not find this in the uploaded papers yet.";
const UNPROCESSED_PAPER_MESSAGE =
  "This paper is uploaded but not processed yet. Please process it first.";
const schemeAnswer=(row:any)=>Array.isArray(row.marking_scheme_answers)?row.marking_scheme_answers[0]:row.marking_scheme_answers;
const officialAnswerText=(row:any)=>isOfficialQuestionAnswer(schemeAnswer(row),row.marking_scheme_link_status,row)?row.answer_text:null;
const safeSchemeStatus=(row:any)=>isOfficialQuestionAnswer(schemeAnswer(row),row.marking_scheme_link_status,row)?row.marking_scheme_link_status:schemeAnswer(row)?.answer_type==="generic_guidance"?"general_guidance":schemeAnswer(row)?"needs_review":"unlinked";

const PaperAction = z.object({
  subjectCode: z.string().regex(/^\d{4}$/),
  year: z.coerce.number().int(),
  session: z.string().min(1),
  paperNumber: z.coerce.number().int().positive(),
  variant: z.coerce.number().int().positive(),
  resourceId: z.coerce.number().int().positive().optional(),
});
const TutorAction = z.discriminatedUnion("type", [
  PaperAction.extend({type:z.literal("paper_analysis")}),
  PaperAction.extend({type:z.literal("show_questions_from_paper")}),
  z.object({type:z.literal("explain_question"),questionId:z.coerce.number().int().positive()}),
  z.object({type:z.literal("show_marking_scheme"),questionId:z.coerce.number().int().positive()}),
  z.object({
    type:z.literal("load_more"),
    queryState:z.object({
      subjectCode:z.string().regex(/^\d{4}$/),topic:z.string().nullable().optional(),
      year:z.number().nullable().optional(),yearFrom:z.number().nullable().optional(),yearTo:z.number().nullable().optional(),
      session:z.string().nullable().optional(),paperNumber:z.number().nullable().optional(),variant:z.number().nullable().optional(),
      difficulty:z.enum(["EASY","MEDIUM","HARD"]).nullable().optional(),markingSchemeOnly:z.boolean().optional(),
    }),
    offset:z.coerce.number().int().min(0),limit:z.coerce.number().int().min(1).max(50).default(10),
  }),
]);
const RequestBody = z.object({
  message: z.string().trim().min(1).max(4000),
  subjectId: z.coerce.number().int().positive(),
  subjectName: z.string().trim().min(1).max(120).optional(),
  level: z.enum(["O_LEVEL", "A_LEVEL"]),
  board: z.string().trim().min(1).max(80).optional(),
  selectedPaperId: z.coerce.number().int().positive().nullable().optional(),
  year: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  session: z.string().trim().nullable().optional(),
  paperNumber: z.coerce.number().int().positive().nullable().optional(),
  variant: z.coerce.number().int().positive().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  offset: z.coerce.number().int().min(0).optional().default(0),
  action: TutorAction.optional(),
  answerLength: z
    .enum(["quick", "teacher", "full"])
    .optional()
    .default("teacher"),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(100)
    .transform((history) => history.slice(-20))
    .optional(),
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
    .toLowerCase()
    .replace(/\[[0-9]+\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const words = text.split(" ").filter(Boolean).slice(0, 45).join(" ");
  return [
    words,
    source.metadata.topic ?? "",
    source.metadata.subtopic ?? "",
    source.metadata.marks ?? "",
  ].join("|");
}

function deduplicateQuestions(sources: SourceResult[]) {
  const seen = new Set<string>();
  const unique: SourceResult[] = [];
  let removed = 0;
  for (const source of sources) {
    const key = normalizedQuestionKey(source);
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    unique.push(source);
  }
  return { unique, removed };
}

function questionSearchAnswer(
  subject: { name: string; code: string },
  sources: SourceResult[],
  message: string,
) {
  const questions = sources.filter(
    (source) => source.sourceType === "question",
  );
  const requestedTopic =
    detectRequestedTopic(message, subject.code)?.topic ??
    expandSearchTerms(message).find(
      (term) => !["hard", "hardest", "difficult", "challenging"].includes(term),
    ) ??
    "matching";
  const lines = questions.map((source, index) => {
    const metadata = source.metadata;
    const session = String(metadata.session ?? "Session unavailable").replace(
      "_",
      " ",
    );
    const topic =
      [metadata.topic, metadata.subtopic].filter(Boolean).join(" · ") ||
      "Topic unavailable";
    return `${index + 1}. ${metadata.year ?? "Year unavailable"} · ${session} · Paper ${metadata.paperCode ?? metadata.paperNumber ?? "—"} · Variant ${metadata.variant ?? "—"} · Question ${metadata.questionNumber ?? "—"} — ${topic} — ${metadata.difficulty ?? "MEDIUM"} — ${metadata.marks ?? "—"} marks [S${index + 1}]`;
  });
  const breakdown = [
    ...new Set(
      questions.map((source) =>
        String(source.metadata.subtopic || source.metadata.topic || "Other"),
      ),
    ),
  ].map(
    (label) =>
      `- ${label}: ${questions.filter((source) => String(source.metadata.subtopic || source.metadata.topic || "Other") === label).length} question(s)`,
  );
  const tip = /\benergy|work|power|efficiency\b/i.test(message)
    ? "For Energy questions, write the correct equation first, substitute with units, and check whether the question asks for energy transferred, power, or efficiency."
    : "Start with the highest-mark questions, identify the command word, and show enough working for every available method mark.";
  return [
    "### Direct answer",
    `I found ${questions.length} strong ${requestedTopic}-related question${questions.length === 1 ? "" : "s"} from ${subject.name} ${subject.code}.`,
    "### Best matches",
    ...lines,
    "### What these questions test",
    ...(breakdown.length
      ? breakdown
      : ["- Review the topic and command word in each verified source."]),
    "### Best practice order",
    "1. Start with a shorter question to check the core idea.",
    "2. Then attempt the highest-mark question and compare your working with its marking scheme.",
    "### Teacher tip",
    tip,
  ].join("\n");
}

async function retrieveResourceSources(
  client: SupabaseClient,
  input: z.infer<typeof RequestBody>,
  subject: { id: number; name: string; code: string },
) {
  const { year, yearFrom, yearTo, paperNumber, session, difficulty, terms } =
    getFilters(input.message, input.year);
  const requestedTopic = detectRequestedTopic(input.message, subject.code);
  let resourcesQuery = client
    .from("resources")
    .select(
      "id,title,resource_type,year,session,paper_code,variant,processing_status",
    )
    .eq("subject_id", subject.id)
    .eq("is_approved", true);
  if (year) resourcesQuery = resourcesQuery.eq("year", year);

  let chunksQuery = client
    .from("ai_chunks")
    .select(
      "id,resource_id,chunk_index,content,metadata,resources!inner(id,title,resource_type,year,session,paper_code,variant,processing_status,is_approved)",
    )
    .eq("subject_id", subject.id)
    .eq("resources.is_approved", true);
  if (year) chunksQuery = chunksQuery.eq("resources.year", year);
  if (terms.length)
    chunksQuery = chunksQuery.or(
      terms
        .slice(0, 3)
        .map((term) => `content.ilike.%${term}%`)
        .join(","),
    );

  let indexedQuery = client
    .from("question_index")
    .select(
      "id,resource_id,legacy_source_id,question_number,topic,subtopic,difficulty,marks,total_marks,display_question_text,clean_question_text,question_text,answer_text,question_screenshot_url,screenshot_status,screenshot_error,page_match_score,screenshot_fallback_used,source_page,bbox,confidence,needs_review,text_quality_status,student_verified,marking_scheme_link_status,source_file,year,session,paper_code,variant,resources!inner(id,title,bucket,storage_path,related_resource_id,is_approved)",
    )
    .eq("subject_id", subject.id)
    .eq("resources.is_approved", true)
    .eq("student_verified", true)
    .not("clean_question_text", "is", null);
  if (year) indexedQuery = indexedQuery.eq("year", year);
  if (yearFrom) indexedQuery = indexedQuery.gte("year", yearFrom);
  if (yearTo) indexedQuery = indexedQuery.lte("year", yearTo);
  if (paperNumber)
    indexedQuery = indexedQuery.eq("paper_code", String(paperNumber));
  if (session) indexedQuery = indexedQuery.eq("session", session);
  if (difficulty) indexedQuery = indexedQuery.eq("difficulty", difficulty);
  if (requestedTopic) {
    indexedQuery =
      requestedTopic.topic === "Energy"
        ? indexedQuery.or(
            "topic.ilike.%Energy%,topic.ilike.%Work Energy and Power%",
          )
        : indexedQuery.ilike("topic", requestedTopic.topic);
    if (requestedTopic.subtopics.length) {
      indexedQuery = indexedQuery.or(
        [
          ...requestedTopic.subtopics.map(
            (subtopic) => `subtopic.ilike.%${subtopic}%`,
          ),
          ...requestedTopic.keywords.map(
            (keyword) => `clean_question_text.ilike.%${keyword}%`,
          ),
        ].join(","),
      );
    }
  } else if (terms.length) {
    indexedQuery = indexedQuery.or(
      terms
        .slice(0, 4)
        .flatMap((term) => [
          `topic.ilike.%${term}%`,
          `subtopic.ilike.%${term}%`,
          `clean_question_text.ilike.%${term}%`,
        ])
        .join(","),
    );
  }
  const [resources, chunks, indexed, topicMap] = await Promise.all([
    resourcesQuery.order("year", { ascending: false }).limit(100),
    chunksQuery.limit(20),
    indexedQuery.limit(100),
    getTopicContext(client, subject.code),
  ]);
  let semantic: { data: any[] | null; error: { message?: string } | null } = {
    data: [],
    error: null,
  };
  if (isAiConfigured()) {
    try {
      const queryEmbedding = await generateQueryEmbedding(input.message);
      semantic = await client.rpc("match_ai_chunks", {
        query_embedding: `[${queryEmbedding.join(",")}]`,
        match_subject_id: subject.id,
        match_count: 12,
        match_threshold: 0.12,
      });
    } catch {
      // Keyword and exact question_index retrieval remain available.
    }
  }
  if (resources.error) throw resources.error;
  if (chunks.error) throw chunks.error;
  if (semantic.error) throw semantic.error;
  if (indexed.error) throw indexed.error;
  const keywordSources: SourceResult[] = (chunks.data ?? []).map((chunk) => {
    const resource = Array.isArray(chunk.resources)
      ? chunk.resources[0]
      : chunk.resources;
    const metadata = {
      resourceId: chunk.resource_id,
      chunkIndex: chunk.chunk_index,
      title: resource?.title,
      resourceType: resource?.resource_type,
      year: resource?.year,
      session: resource?.session,
      paperCode: resource?.paper_code,
      variant: resource?.variant,
      sourceFile: chunk.metadata?.sourceFile,
    };
    return {
      sourceType: "resource",
      id: chunk.id,
      paperId: null,
      reference: formatCitation(subject, metadata),
      content: chunk.content.slice(0, 5000),
      metadata,
    };
  });
  const semanticSources: SourceResult[] = (semantic.data ?? [])
    .filter(
      (chunk: { metadata: Record<string, unknown> }) =>
        !year || Number(chunk.metadata.year) === year,
    )
    .map(
      (chunk: {
        id: number;
        resource_id: number;
        chunk_index: number;
        content: string;
        metadata: Record<string, unknown>;
        similarity: number;
      }) => ({
        sourceType: "resource",
        id: chunk.id,
        paperId: null,
        reference: formatCitation(subject, chunk.metadata),
        content: chunk.content.slice(0, 5000),
        metadata: {
          ...chunk.metadata,
          resourceId: chunk.resource_id,
          chunkIndex: chunk.chunk_index,
          similarity: chunk.similarity,
        },
      }),
    );
  const rawQuestionSources: SourceResult[] = (indexed.data ?? []).map(
    (row) => ({
      sourceType: "question",
      id: row.id,
      paperId: null,
      reference: formatCitation(subject, {
        sourceFile: row.source_file,
        year: row.year,
        session: row.session,
        paperCode: row.paper_code,
        variant: row.variant,
        questionNumber: row.question_number,
      }),
      content:
        `Question: ${row.clean_question_text ?? row.display_question_text ?? row.question_text}${row.answer_text ? `\nMarking scheme answer: ${row.answer_text}` : ""}`.slice(
          0,
          5000,
        ),
      metadata: {
        resourceId: row.resource_id,
        legacyQuestionId: row.legacy_source_id,
        questionNumber: row.question_number,
        topic: row.topic,
        subtopic: row.subtopic,
        confidence: row.confidence,
        needsReview: row.needs_review,
        studentVerified: row.student_verified,
        markingSchemeLinkStatus: row.marking_scheme_link_status,
        difficulty: row.difficulty,
        marks: row.total_marks ?? row.marks,
        questionText:
          row.display_question_text ??
          row.clean_question_text ??
          row.question_text,
        answerText: row.answer_text,
        screenshotUrl:
          screenshotMode() === "on_demand" ? null : row.question_screenshot_url,
        screenshotStatus:
          screenshotMode() === "on_demand"
            ? "not_generated"
            : row.screenshot_status,
        screenshotError: row.screenshot_error,
        pageMatchScore: row.page_match_score,
        screenshotFallbackUsed: row.screenshot_fallback_used,
        sourcePage: row.source_page,
        bbox: row.bbox,
        filePath: (Array.isArray(row.resources)
          ? row.resources[0]
          : row.resources
        )?.storage_path,
        sourceFile: row.source_file,
        year: row.year,
        session: row.session,
        paperCode: row.paper_code,
        variant: row.variant,
      },
    }),
  );
  const deduplicated = deduplicateQuestions(rawQuestionSources);
  const questionSources = deduplicated.unique;
  const seen = new Set<string>();
  const uniqueSources = [
    ...questionSources,
    ...semanticSources,
    ...keywordSources,
  ].filter((source) => {
    const key = `${source.sourceType}:${source.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sources = rankEvidence(uniqueSources, terms, 12);
  return {
    resources: resources.data ?? [],
    sources,
    indexedQuestionCount: indexed.data?.length ?? 0,
    duplicatesRemoved: deduplicated.removed,
    topicMapCount: topicMap.count,
  };
}

function getFilters(message: string, explicitYear?: number | null) {
  const filename = message.match(/\b(4024|5054)_([smw])(\d{2})_(?:qp|ms)_(\d)(\d)\b/i);
  const filenameYear = filename ? 2000 + Number(filename[3]) : null;
  const year =
    (filenameYear ?? explicitYear ?? Number(message.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0)) ||
    null;
  const years = [...message.matchAll(/\b((?:19|20)\d{2})\b/g)].map((match) =>
    Number(match[1]),
  );
  const lastYears = Number(
    message.match(/last\s+(\d{1,2})\s+years?/i)?.[1] ?? 0,
  );
  const currentYear = new Date().getUTCFullYear();
  const yearFrom =
    years.length >= 2
      ? Math.min(...years)
      : lastYears
        ? currentYear - lastYears + 1
        : null;
  const yearTo =
    years.length >= 2 ? Math.max(...years) : lastYears ? currentYear : null;
  const paperNumber = filename ? Number(filename[4]) :
    Number(message.match(/(?:paper|p)\s*(\d{1,2})\b/i)?.[1] ?? 0) || null;
  const lower = message.toLowerCase();
  const session = filename
    ? ({s:"MAY_JUNE",w:"OCT_NOV",m:"FEB_MAR"} as const)[filename[2].toLowerCase() as "s"|"w"|"m"]
    : lower.includes("may/june") || lower.includes("may june")
      ? "MAY_JUNE"
      : lower.includes("oct/nov") || lower.includes("oct nov")
        ? "OCT_NOV"
        : lower.includes("feb/march") || lower.includes("feb march")
          ? "FEB_MAR"
          : null;
  const rankedDifficultyRequest = /\b(hardest|difficult|challenging)\b/i.test(
    message,
  );
  const difficulty =
    !rankedDifficultyRequest && /\bhard\b/i.test(message)
      ? "HARD"
      : /\beasy\b/i.test(message)
        ? "EASY"
        : /\bmedium\b/i.test(message)
          ? "MEDIUM"
          : null;
  return {
    year: years.length >= 2 || lastYears ? null : year,
    yearFrom,
    yearTo,
    paperNumber,
    variant: filename ? Number(filename[5]) : null,
    session,
    difficulty,
    terms: expandSearchTerms(message),
  };
}

async function retrieveSources(
  client: SupabaseClient,
  input: z.infer<typeof RequestBody>,
  subject: { id: number; name: string; code: string },
) {
  const { year, paperNumber, session, terms } = getFilters(
    input.message,
    input.year,
  );
  const searchTerms = terms.slice(0, 4);

  let papersQuery = client
    .from("papers")
    .select(
      "id,title,year,session,paper_number,variant,source_type,raw_text,ingestion_status",
    )
    .eq("subject_id", subject.id);
  if (input.selectedPaperId)
    papersQuery = papersQuery.eq("id", input.selectedPaperId);
  if (year) papersQuery = papersQuery.eq("year", year);
  if (paperNumber) papersQuery = papersQuery.eq("paper_number", paperNumber);
  if (session) papersQuery = papersQuery.eq("session", session);
  let questionsQuery = client
    .from("questions")
    .select(
      "id,paper_id,question_number,question,question_text,extracted_text,topic,subtopic,difficulty,marks,year,papers!inner(title,session,paper_number,variant)",
    )
    .eq("subject_id", subject.id);
  if (input.selectedPaperId)
    questionsQuery = questionsQuery.eq("paper_id", input.selectedPaperId);
  if (year) questionsQuery = questionsQuery.eq("year", year);
  if (paperNumber)
    questionsQuery = questionsQuery.eq("papers.paper_number", paperNumber);
  if (session) questionsQuery = questionsQuery.eq("papers.session", session);
  if (searchTerms.length)
    questionsQuery = questionsQuery.or(
      searchTerms
        .flatMap((term) => [
          `topic.ilike.%${term}%`,
          `subtopic.ilike.%${term}%`,
          `question_text.ilike.%${term}%`,
          `question.ilike.%${term}%`,
          `extracted_text.ilike.%${term}%`,
        ])
        .join(","),
    );

  let questionCountQuery = client
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", subject.id);
  if (input.selectedPaperId)
    questionCountQuery = questionCountQuery.eq(
      "paper_id",
      input.selectedPaperId,
    );
  if (year) questionCountQuery = questionCountQuery.eq("year", year);

  let notesQuery = client
    .from("notes")
    .select("id,title,topic,content,summary")
    .eq("subject_id", subject.id);
  if (searchTerms.length)
    notesQuery = notesQuery.or(
      searchTerms
        .flatMap((term) => [
          `title.ilike.%${term}%`,
          `topic.ilike.%${term}%`,
          `content.ilike.%${term}%`,
          `summary.ilike.%${term}%`,
        ])
        .join(","),
    );

  let topicsQuery = client
    .from("topics")
    .select("id,name,slug")
    .eq("subject_id", subject.id);
  if (searchTerms.length)
    topicsQuery = topicsQuery.or(
      searchTerms
        .flatMap((term) => [`name.ilike.%${term}%`, `slug.ilike.%${term}%`])
        .join(","),
    );

  const [papers, questions, topics, notes, questionCount] = await Promise.all([
    papersQuery.limit(20),
    questionsQuery.limit(200),
    topicsQuery.limit(30),
    notesQuery.limit(30),
    questionCountQuery,
  ]);
  for (const result of [papers, questions, topics, notes, questionCount])
    if (result.error) throw result.error;

  const results: SourceResult[] = [];
  for (const row of questions.data ?? []) {
    const paper = Array.isArray(row.papers) ? row.papers[0] : row.papers;
    const metadata = {
      legacyQuestionId: row.id,
      title: paper?.title,
      sourceFile: paper?.title,
      year: row.year,
      session: paper?.session,
      paperNumber: paper?.paper_number,
      variant: paper?.variant,
      questionNumber: row.question_number,
      topic: row.topic,
      subtopic: row.subtopic,
      difficulty: row.difficulty,
      marks: row.marks,
    };
    results.push({
      sourceType: "question",
      id: row.id,
      paperId: row.paper_id,
      reference: formatCitation(subject, metadata),
      content: [row.question_text ?? row.question, row.extracted_text]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000),
      metadata,
    });
  }
  for (const row of notes.data ?? [])
    results.push({
      sourceType: "note",
      id: row.id,
      paperId: null,
      reference: `${subject.name} note: ${row.title}`,
      content: [row.topic, row.summary, row.content]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000),
      metadata: { topic: row.topic },
    });
  for (const row of topics.data ?? [])
    results.push({
      sourceType: "topic",
      id: row.id,
      paperId: null,
      reference: `${subject.name} topic: ${row.name}`,
      content: row.name,
      metadata: { slug: row.slug },
    });
  for (const row of papers.data ?? []) {
    const metadata = {
      title: row.title,
      sourceFile: row.title,
      year: row.year,
      session: row.session,
      paperNumber: row.paper_number,
      variant: row.variant,
      sourceType: row.source_type,
      ingestionStatus: row.ingestion_status,
      hasExtractedText: Boolean(row.raw_text),
    };
    results.push({
      sourceType: "paper",
      id: row.id,
      paperId: row.id,
      reference: formatCitation(subject, metadata),
      content: [row.title, row.raw_text]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000),
      metadata,
    });
  }

  return {
    sources: rankEvidence(results, terms, 12),
    matchedPapers: papers.data ?? [],
    matchedQuestions: questions.data ?? [],
    extractedQuestionCount: questionCount.count ?? 0,
  };
}

router.post("/ai-assistant", requireUser, async (req, res): Promise<void> => {
  try {
    const parsed = RequestBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error: parsed.error.issues[0]?.message ?? "Invalid AI request.",
        });
      return;
    }
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const client = createUserClient(token!);
    const input = parsed.data;
    const parsedQuery=parseStudentPromptToQuery(input.message);
    const userEmail=String(res.locals.user?.email??"").trim().toLowerCase();
    const adminCheck=input.debug&&userEmail?await client.from("admin_users").select("email").eq("email",userEmail).maybeSingle():{data:null};
    const showDiagnostics=Boolean(input.debug&&adminCheck.data);
    const actionSubjectCode = input.action && "subjectCode" in input.action ? input.action.subjectCode : null;
    const explicitSubjectCode = actionSubjectCode ?? parsedQuery.syllabusCode ?? detectSubjectCode(input.message);
    let subjectQuery = client
      .from("subjects")
      .select("id,name,code,level,board");
    subjectQuery = explicitSubjectCode ? subjectQuery.eq("code", explicitSubjectCode) : subjectQuery.eq("level", input.level).eq("id", input.subjectId);
    const { data: subject, error: subjectError } = await subjectQuery.single();
    if (subjectError || !subject) {
      res.status(404).json({ error: "Subject not found." });
      return;
    }
    if (
      !explicitSubjectCode && input.subjectName &&
      input.subjectName.toLowerCase() !== subject.name.toLowerCase()
    ) {
      res
        .status(400)
        .json({ error: "Subject scope does not match the selected subject." });
      return;
    }
    if (
      !explicitSubjectCode && input.board &&
      input.board.toLowerCase() !== subject.board.toLowerCase()
    ) {
      res
        .status(400)
        .json({ error: "Board scope does not match the selected subject." });
      return;
    }
    const examIntent=detectExamIntent(input.message);
    const deterministic=createExamEngine(client);
    const parsedFilters=getFilters(input.message,input.year);
    const engineFilters:ExamFilters={
      subjectId:subject.id,subjectCode:subject.code,
      year:parsedFilters.year??input.year??undefined,yearFrom:parsedFilters.yearFrom??undefined,yearTo:parsedFilters.yearTo??undefined,
      session:parsedFilters.session??input.session??undefined,paperNumber:parsedFilters.paperNumber??input.paperNumber??undefined,
      variant:parsedFilters.variant??input.variant??undefined,difficulty:parsedFilters.difficulty as ExamFilters["difficulty"],limit:input.limit,offset:input.offset,
      questionType:parsedQuery.questionType??undefined,markingSchemeOnly:parsedQuery.markingSchemeRequired,
    };
    const isMathsPaperDebug=process.env.NODE_ENV!=="production"&&input.message.trim().toLowerCase()==="give me 2023 maths paper 1";
    if(isMathsPaperDebug) console.info("[AI Tutor route debug]",{rawQuery:input.message,detectedIntent:examIntent,detectedSubject:subject.name,detectedSubjectCode:subject.code,year:engineFilters.year,session:engineFilters.session,paperNumber:engineFilters.paperNumber,finalFilters:engineFilters});
    const schemeResourceId=(row:any)=>Number((Array.isArray(row.marking_scheme_answers)?row.marking_scheme_answers[0]:row.marking_scheme_answers)?.resource_id)||null;
    if(input.action?.type==="paper_analysis"){
      const a=input.action;
      const analysis=await deterministic.getTopicCountsForPaper({subjectCode:a.subjectCode,year:a.year,session:a.session,paperNumber:a.paperNumber,variant:a.variant});
      const verifiedCount=analysis.topics.reduce((sum,row)=>sum+row.questions,0);
      res.json({answer:[`${subject.name} ${subject.code} · ${a.session.replace("_"," ")} ${a.year} · Paper ${a.paperNumber} Variant ${a.variant}`,`${verifiedCount} verified indexed questions found.`,"### Topic breakdown",...analysis.topics.map(row=>`- ${row.topic}: ${row.questions} questions, ${row.marks} marks`)].join("\n"),sources:[],intent:"paper_analysis",analysis});
      return;
    }
    if(input.action?.type==="show_questions_from_paper"){
      const a=input.action;
      const result=await deterministic.findQuestions({subjectCode:a.subjectCode,year:a.year,session:a.session,paperNumber:a.paperNumber,variant:a.variant,limit:10});
      const sources=result.rows.map((row:any,index:number)=>({chunkId:row.id,sourceType:"question",paperId:null,resourceId:row.resource_id,markingSchemeResourceId:schemeResourceId(row),year:row.year,session:row.session,paperNumber:Number(row.paper_code),variant:row.variant,questionNumber:row.question_number,questionText:row.display_question_text??row.clean_question_text,answerText:officialAnswerText(row),markingSchemeLinkStatus:safeSchemeStatus(row),screenshotUrl:row.question_screenshot_url,screenshotStatus:row.screenshot_status,sourcePage:row.source_page,bbox:row.bbox,topic:row.topic,subtopic:row.subtopic,difficulty:row.difficulty,marks:row.total_marks??row.marks,reference:`[S${index+1}] ${subject.name} ${subject.code} · ${row.year} · ${row.session} · Paper ${row.paper_code} · Variant ${row.variant} · Question ${row.question_number}`}));
      res.json({answer:`I found ${result.total} verified questions for this exact paper. Showing ${sources.length}.`,sources,intent:"question_search",pagination:{total:result.total,limit:result.limit,offset:0,hasMore:result.hasMore},searchContext:{subjectCode:a.subjectCode,topic:null,year:a.year,yearFrom:null,yearTo:null,session:a.session,paperNumber:a.paperNumber,variant:a.variant,difficulty:null,markingSchemeOnly:false}});
      return;
    }
    if(input.action?.type==="explain_question"||input.action?.type==="show_marking_scheme"){
      const question=await deterministic.getQuestionWithSources(input.action.questionId);
      const scheme=input.action.type==="show_marking_scheme"?await deterministic.getLinkedMarkingScheme(input.action.questionId):null;
      const source={chunkId:question.id,sourceType:"question",paperId:null,resourceId:question.resource_id,markingSchemeResourceId:schemeResourceId(question),year:question.year,session:question.session,paperNumber:Number(question.paper_code),variant:question.variant,questionNumber:question.question_number,questionText:question.display_question_text??question.clean_question_text,answerText:officialAnswerText(question),markingSchemeLinkStatus:safeSchemeStatus(question),screenshotUrl:question.question_screenshot_url,screenshotStatus:question.screenshot_status,sourcePage:question.source_page,bbox:question.bbox,topic:question.topic,subtopic:question.subtopic,difficulty:question.difficulty,marks:question.total_marks??question.marks,reference:`[S1] ${subject.name} ${subject.code} · ${question.year} · ${question.session} · Paper ${question.paper_code} · Variant ${question.variant} · Question ${question.question_number}`};
      res.json({answer:input.action.type==="show_marking_scheme"?(scheme?`Official question-specific marking-scheme data:\n\n${scheme.answer_text}`:"The official question-specific marking scheme is not linked for this question yet."):`${question.display_question_text??question.clean_question_text}\n\nAI explanation is unavailable, but verified source data is available.`,sources:[source],intent:input.action.type==="show_marking_scheme"?"marking_scheme_lookup":"question_explanation"});
      return;
    }
    if(input.action?.type==="load_more"){
      const q=input.action.queryState;
      const result=await deterministic.findQuestions({...q,topic:q.topic??undefined,year:q.year??undefined,yearFrom:q.yearFrom??undefined,yearTo:q.yearTo??undefined,session:q.session??undefined,paperNumber:q.paperNumber??undefined,variant:q.variant??undefined,difficulty:q.difficulty??undefined,limit:input.action.limit,offset:input.action.offset});
      const sources=result.rows.map((row:any,index:number)=>({chunkId:row.id,sourceType:"question",paperId:null,resourceId:row.resource_id,markingSchemeResourceId:schemeResourceId(row),year:row.year,session:row.session,paperNumber:Number(row.paper_code),variant:row.variant,questionNumber:row.question_number,questionText:row.display_question_text??row.clean_question_text,answerText:officialAnswerText(row),markingSchemeLinkStatus:safeSchemeStatus(row),screenshotUrl:row.question_screenshot_url,screenshotStatus:row.screenshot_status,sourcePage:row.source_page,bbox:row.bbox,topic:row.topic,subtopic:row.subtopic,difficulty:row.difficulty,marks:row.total_marks??row.marks,reference:`[S${index+1}] ${subject.name} ${subject.code} · ${row.year} · ${row.session} · Paper ${row.paper_code} · Variant ${row.variant} · Question ${row.question_number}`}));
      res.json({answer:`Showing ${sources.length} more verified questions.`,sources,intent:"question_search",pagination:{total:result.total,limit:result.limit,offset:result.offset,hasMore:result.hasMore},searchContext:q});
      return;
    }
    if(examIntent==="paper_lookup"){
      const result=await deterministic.findPapers(engineFilters);
      const rows=result.rows.filter((row)=>row.resource_type==="PAST_PAPER");
      const answer=rows.length?`I found ${result.total} matching Cambridge paper resource${result.total===1?"":"s"}. Showing ${rows.length}.`:"No matching processed Cambridge paper was found in the uploaded resources.";
      const sources=rows.map((row,index)=>({chunkId:row.id,sourceType:"resource" as const,paperId:null,resourceId:row.id,year:row.year,session:row.session,paperNumber:row.paper_number??row.paper_code,variant:row.variant,questionNumber:null,reference:`[S${index+1}] ${subject.name} ${subject.code} · ${row.year} · ${String(row.session??"").replace("_"," ")} · Paper ${row.paper_number??row.paper_code} · Variant ${row.variant}`}));
      res.json({answer,sources,intent:examIntent,pagination:{total:result.total,limit:result.limit,offset:result.offset}});
      return;
    }
    if(examIntent==="question_search"){
      const requested=detectRequestedTopic(input.message,subject.code);
      const result=await deterministic.findQuestions({...engineFilters,topic:parsedQuery.topic??requested?.topic,limit:50,offset:0});
      const validation=result.rows.map((row:any)=>{
        const nestedSubject=Array.isArray(row.subjects)?row.subjects[0]:row.subjects;
        return{row,validation:validateSourceAgainstParsedQuery({...row,subject_code:nestedSubject?.code,level:nestedSubject?.level},parsedQuery)};
      });
      const validRows=validation.filter(item=>item.validation.valid).map(item=>item.row);
      const rejected=validation.filter(item=>!item.validation.valid);
      const displayedRows=validRows.slice(input.offset,input.offset+input.limit);
      const sources=displayedRows.map((row,index)=>{
        const resource=Array.isArray(row.resources)?row.resources[0]:row.resources;
        return {chunkId:row.id,sourceType:"question" as const,paperId:null,resourceId:row.resource_id,markingSchemeResourceId:schemeResourceId(row),year:row.year,session:row.session,paperNumber:row.paper_code,variant:row.variant,questionNumber:row.question_number,questionText:row.display_question_text??row.clean_question_text,answerText:officialAnswerText(row),markingSchemeLinkStatus:safeSchemeStatus(row),screenshotUrl:row.question_screenshot_url,screenshotStatus:row.screenshot_status,sourcePage:row.source_page,bbox:row.bbox,filePath:resource?.storage_path,topic:row.topic,subtopic:row.subtopic,difficulty:row.difficulty,marks:row.total_marks??row.marks,reference:`[S${index+1}] ${subject.name} ${subject.code} · ${row.year} · ${String(row.session??"").replace("_"," ")} · Paper ${row.paper_code} · Variant ${row.variant} · Question ${row.question_number}`};
      });
      const exactCount=validRows.length,topic=parsedQuery.topic??requested?.topic??"matching";
      const filterSummary=[parsedQuery.level?.replace("_"," "),`${subject.name} ${subject.code}`,engineFilters.paperNumber?`Paper ${engineFilters.paperNumber}`:null,parsedQuery.questionType?`${parsedQuery.questionType}-based questions`:null,parsedQuery.yearStart&&parsedQuery.yearEnd?`${parsedQuery.yearStart}–${parsedQuery.yearEnd}`:null].filter(Boolean).join(" · ");
      const answer=exactCount?`I found ${exactCount} exact verified questions on ${topic}. Showing ${sources.length}.${exactCount>sources.length?" Load more to see the next results.":""}`:`I could not find exact indexed matches for: ${filterSummary}. Some papers may not be fully indexed or their question type may still need verification.`;
      res.json({answer,sources,intent:examIntent,pagination:{total:exactCount,limit:input.limit,offset:input.offset,hasMore:input.offset+input.limit<exactCount},searchContext:{subjectCode:subject.code,topic:parsedQuery.topic??requested?.topic??null,year:engineFilters.year??null,yearFrom:engineFilters.yearFrom??null,yearTo:engineFilters.yearTo??null,session:engineFilters.session??null,paperNumber:engineFilters.paperNumber??null,variant:engineFilters.variant??null,difficulty:engineFilters.difficulty??null,markingSchemeOnly:parsedQuery.markingSchemeRequired,questionType:parsedQuery.questionType},...(showDiagnostics?{diagnostics:{originalPrompt:input.message,parsedQuery,hardFilters:engineFilters,candidatesBeforeValidation:result.rows.length,afterValidation:exactCount,rejectedSourceCount:rejected.length,rejections:rejected.map(item=>({id:item.row.id,reasons:item.validation.reasons})),finalSourceIds:sources.map(source=>source.chunkId)}}:{})});
      return;
    }
    if(examIntent==="topic_count"){
      const requested=detectRequestedTopic(input.message,subject.code);
      const result=await deterministic.getTopicCountsForYearRange({...engineFilters,topic:requested?.topic});
      const selected=requested?.topic?result.topics.find(row=>row.topic.toLowerCase()===requested.topic.toLowerCase()):null;
      res.json({answer:selected?`${selected.topic} appears in ${selected.questions} verified questions worth ${selected.marks} recorded marks in the selected data.`:`I found ${result.total} verified questions in the selected data.`,sources:[],intent:examIntent,analysis:result});
      return;
    }
    if(examIntent==="paper_analysis"&&engineFilters.year&&engineFilters.session&&engineFilters.paperNumber&&engineFilters.variant){
      const analysis=await deterministic.getTopicCountsForPaper({subjectCode:subject.code,year:engineFilters.year,session:engineFilters.session,paperNumber:engineFilters.paperNumber,variant:engineFilters.variant});
      const lines=analysis.topics.map(row=>`- ${row.topic}: ${row.questions} question${row.questions===1?"":"s"}, ${row.marks} marks`);
      res.json({answer:[`### ${subject.name} ${subject.code} paper analysis`,"### Topic breakdown",...lines].join("\n"),sources:[],intent:examIntent,analysis});
      return;
    }
    if(examIntent==="topic_trend"){
      const topic=detectRequestedTopic(input.message,subject.code)?.topic;
      const trend=await deterministic.getTopicTrend({...engineFilters,topic});
      const lines=trend.map(row=>`- ${row.year}: ${row.questions} questions, ${row.marks} marks`);
      res.json({answer:[`### ${topic??"Topic"} trend`,"Verified indexed data:",...lines].join("\n"),sources:[],intent:examIntent,trend});
      return;
    }
    if(examIntent==="repeated_questions"){
      const requested=detectRequestedTopic(input.message,subject.code);
      const patterns=await deterministic.getRepeatedQuestionPatterns({...engineFilters,topic:requested?.topic});
      res.json({answer:`I found ${patterns.length} repeated or closely matching question pattern${patterns.length===1?"":"s"} in verified data.`,sources:[],intent:examIntent,patterns});
      return;
    }
    const mode = assistantModeFor(input.message);
    const questionListRequest =
      /\b(give|show|find|list|make|generate)\b.*\b(questions?|worksheet|practice|paper\s*\d)\b/i.test(
        input.message,
      );
    const teacherName = cambridgeTeacherName(subject.name);
    if (requestedOutsideSubject(input.message, subject.name)) {
      res.json({
        answer: `I’m your ${teacherName}, so I can only help with ${subject.name} in this workspace. Please open the correct subject page for that question.`,
        sources: [],
        ...(showDiagnostics
          ? {
              diagnostics: {
                mode,
                activeSubject: subject.name,
                blockedOutsideSubject: true,
              },
              retrievedResults: [],
            }
          : {}),
      });
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
    const rankedRetrieved = rankEvidence(
      combined.filter((source) => {
        const key = `${source.sourceType}:${source.metadata.legacyQuestionId ?? source.metadata.resourceId ?? source.paperId ?? source.id}:${source.metadata.questionNumber ?? ""}:${source.content.slice(0, 120)}`;
        if (seenEvidence.has(key)) return false;
        seenEvidence.add(key);
        return true;
      }),
      getFilters(input.message, input.year).terms,
      12,
    );
    const retrieved = questionListRequest
      ? rankedRetrieved
          .filter((source) => source.sourceType === "question")
          .slice(0, 6)
      : rankedRetrieved;
    const onlyUnprocessedResources =
      resourceRetrieval.resources.length > 0 &&
      resourceRetrieval.resources.every(
        (resource) => resource.processing_status !== "processed",
      );
    const onlyUnprocessedPapers =
      legacyRetrieval.matchedPapers.length > 0 &&
      legacyRetrieval.extractedQuestionCount === 0;
    if (
      mode === "rag" &&
      !retrieved.length &&
      (onlyUnprocessedResources || onlyUnprocessedPapers)
    ) {
      res.json({
        answer: onlyUnprocessedResources
          ? "This resource is uploaded but not processed yet. Please process it first."
          : UNPROCESSED_PAPER_MESSAGE,
        sources: [],
        ...(showDiagnostics ? { retrievedResults: [], diagnostics } : {}),
      });
      return;
    }
    if (mode === "rag" && retrieved.length === 0) {
      const subjectResources = resourceRetrieval.resources;
      const questionPapers = subjectResources.filter(
        (resource) => resource.resource_type === "PAST_PAPER",
      );
      const markingSchemes = subjectResources.filter(
        (resource) => resource.resource_type === "MARKING_SCHEME",
      );
      const failedPapers = questionPapers.filter(
        (resource) => resource.processing_status === "failed",
      );
      const statusMessages = [
        resourceRetrieval.indexedQuestionCount === 0 && questionPapers.length
          ? "Maths papers are uploaded but not indexed yet."
          : null,
        resourceRetrieval.topicMapCount === 0 && subject.code === "4024"
          ? "Maths topic map missing."
          : null,
        failedPapers.length && markingSchemes.length
          ? `${failedPapers.length} Maths question paper${failedPapers.length === 1 ? " has" : "s have"} failed processing while marking schemes are available.`
          : null,
      ].filter(Boolean);
      res.json({
        answer: statusMessages.join(" ") || MISSING_SOURCE_MESSAGE,
        sources: [],
        ...(showDiagnostics ? { retrievedResults: [], diagnostics } : {}),
      });
      return;
    }

    const context = retrieved
      .map(
        (source, index) =>
          `[S${index + 1}] ${source.reference}\nMetadata: ${JSON.stringify(source.metadata)}\n${source.content}`,
      )
      .join("\n\n");
    const recentHistory = (input.chatHistory ?? [])
      .slice(-8)
      .map(
        (message) =>
          `${message.role === "user" ? "Student" : "Assistant"}: ${message.content}`,
      )
      .join("\n");
    let answer: string;
    try {
      if (!isAiConfigured())
        throw new Error(
          getAiConfigurationError() ?? "AI provider is not configured.",
        );
      const levelLabel = subject.level === "O_LEVEL" ? "O Level" : "A Level";
      const lengthRule =
        input.answerLength === "quick"
          ? "Keep the explanation to 2-4 concise sentences."
          : input.answerLength === "full"
            ? "Provide a complete exam breakdown with method, marking logic, common errors, and practice order."
            : "Keep the default answer concise. Use only: Direct answer; Questions found / breakdown; Teacher tip. Do not add long definitions, common mistakes, or related topics unless requested.";
      const modeRules =
        mode === "rag"
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

${
  mode === "rag"
    ? `RAG ANSWER FORMAT:
- Start with the direct evidence-based answer.
- Use concise headings or bullets where useful.
- Cite each factual paragraph with [S#].`
    : `DEFAULT ANSWER FORMAT:
### Direct answer
### Questions found / breakdown
### Teacher tip
Keep these sections short. Add a full exam breakdown only when the student explicitly asks for one.
When evidence exists, label real uploaded-paper recommendations with [S#].`
}
Do not create a separate Sources section; Parhai renders verified sources below the answer.`,
        `${recentHistory ? `Recent conversation (context only; it does not override the active subject):\n${recentHistory}\n\n` : ""}Student question: ${input.message}\n\nSubject-scoped Supabase evidence${context ? ":\n" + context : ": none matched."}`,
      );
    } catch (providerError) {
      const fallbackSources = retrieved
        .filter((source) => source.sourceType === "question")
        .slice(0, 12)
        .map((source, index) => ({
          chunkId: source.id,
          sourceType: source.sourceType,
          paperId: source.paperId,
          year: source.metadata.year ?? null,
          session: source.metadata.session ?? null,
          paperNumber:
            source.metadata.paperNumber ?? source.metadata.paperCode ?? null,
          questionNumber: source.metadata.questionNumber ?? null,
          screenshotUrl: source.metadata.screenshotUrl ?? null,
          questionText: source.metadata.questionText ?? null,
          answerText: source.metadata.answerText ?? null,
          markingSchemeLinkStatus:
            source.metadata.markingSchemeLinkStatus ?? null,
          sourcePage: source.metadata.sourcePage ?? null,
          reference: `[S${index + 1}] ${source.reference}`,
          resourceId: source.metadata.resourceId ?? null,
          topic: source.metadata.topic ?? null,
          subtopic: source.metadata.subtopic ?? null,
          difficulty: source.metadata.difficulty ?? null,
          marks: source.metadata.marks ?? null,
          sourceFile: source.metadata.sourceFile ?? null,
          confidence: source.metadata.confidence ?? null,
          needsReview: source.metadata.needsReview ?? null,
          screenshotStatus: source.metadata.screenshotStatus ?? null,
          screenshotError: source.metadata.screenshotError ?? null,
          pageMatchScore: source.metadata.pageMatchScore ?? null,
          screenshotFallbackUsed:
            source.metadata.screenshotFallbackUsed ?? null,
          bbox: source.metadata.bbox ?? null,
          filePath: source.metadata.filePath ?? null,
        }));
      const resultSummary = questionListRequest
        ? formatQuestionResultSummary(
            resourceRetrieval.indexedQuestionCount,
            resourceRetrieval.duplicatesRemoved,
            fallbackSources.length,
          )
        : "";
      const fallbackAnswer = retrieved.length
        ? questionListRequest
          ? `${questionSearchAnswer(subject, retrieved, input.message)}\n\nI found verified questions from your uploaded papers. A full AI explanation is temporarily unavailable, but you can still review the source cards below.`
          : "I found verified questions from your uploaded papers. A full AI explanation is temporarily unavailable, but you can still review the source cards below."
        : "I could not find a matching verified question in your uploaded papers yet.";
      res.json({
        answer: [resultSummary, fallbackAnswer].filter(Boolean).join("\n\n"),
        sources: fallbackSources,
        providerUnavailable: true,
        ...(showDiagnostics
          ? {
              providerError:
                providerError instanceof Error
                  ? providerError.message
                  : "AI provider request failed.",
              retrievedResults: retrieved,
              diagnostics,
            }
          : {}),
      });
      return;
    }

    const grounded =
      mode === "rag"
        ? finalizeGroundedAnswer(
            answer,
            retrieved.length,
            MISSING_SOURCE_MESSAGE,
          )
        : finalizeTeacherAnswer(answer, retrieved.length, mode);
    const cited = new Set(grounded.citedIndexes);
    const sources = retrieved.flatMap((source, index) =>
      cited.has(index + 1) ||
      (questionListRequest && source.sourceType === "question")
        ? [
            {
              chunkId: source.id,
              sourceType: source.sourceType,
              paperId: source.paperId,
              resourceId: source.metadata.resourceId ?? null,
              year: source.metadata.year ?? null,
              session: source.metadata.session ?? null,
              paperNumber:
                source.metadata.paperNumber ??
                source.metadata.paperCode ??
                null,
              variant: source.metadata.variant ?? null,
              questionNumber: source.metadata.questionNumber ?? null,
              screenshotUrl: source.metadata.screenshotUrl ?? null,
              screenshotStatus: source.metadata.screenshotStatus ?? null,
              screenshotError: source.metadata.screenshotError ?? null,
              pageMatchScore: source.metadata.pageMatchScore ?? null,
              screenshotFallbackUsed:
                source.metadata.screenshotFallbackUsed ?? null,
              questionText: source.metadata.questionText ?? null,
              answerText: source.metadata.answerText ?? null,
              markingSchemeLinkStatus:
                source.metadata.markingSchemeLinkStatus ?? null,
              sourcePage: source.metadata.sourcePage ?? null,
              bbox: source.metadata.bbox ?? null,
              filePath: source.metadata.filePath ?? null,
              topic: source.metadata.topic ?? null,
              subtopic: source.metadata.subtopic ?? null,
              confidence: source.metadata.confidence ?? null,
              needsReview: source.metadata.needsReview ?? null,
              difficulty: source.metadata.difficulty ?? null,
              marks: source.metadata.marks ?? null,
              sourceFile: source.metadata.sourceFile ?? null,
              reference: `[S${index + 1}] ${source.reference}`,
            },
          ]
        : [],
    );
    const { error: historyError } = await client.from("chat_messages").insert([
      {
        user_id: res.locals.user.id,
        subject_id: subject.id,
        paper_id: input.selectedPaperId ?? null,
        role: "user",
        content: input.message,
        sources: [],
      },
      {
        user_id: res.locals.user.id,
        subject_id: subject.id,
        paper_id: input.selectedPaperId ?? null,
        role: "assistant",
        content: grounded.answer,
        sources,
      },
    ]);
    if (historyError) throw historyError;
    const { error: logError } = await client
      .from("ai_chat_logs")
      .insert({
        user_id: res.locals.user.id,
        subject_id: subject.id,
        user_question: input.message,
        ai_answer: grounded.answer,
        sources_used: sources,
      });
    if (logError) req.log.warn({ logError }, "Could not save AI audit log");

    const displayedQuestions = sources.filter(
      (source) => source.sourceType === "question",
    ).length;
    const resultSummary = questionListRequest
      ? formatQuestionResultSummary(
          resourceRetrieval.indexedQuestionCount,
          resourceRetrieval.duplicatesRemoved,
          displayedQuestions,
        )
      : "";
    const presentedAnswer = questionListRequest
      ? questionSearchAnswer(subject, retrieved, input.message)
      : grounded.answer;
    res.json({
      answer: [resultSummary, presentedAnswer].filter(Boolean).join("\n\n"),
      sources,
      ...(showDiagnostics ? { retrievedResults: retrieved, diagnostics } : {}),
    });
  } catch (error) {
    req.log.error({ error }, "AI assistant request failed");
    res
      .status(500)
      .json({
        error:
          error instanceof Error
            ? error.message
            : "AI assistant request failed.",
      });
  }
});

export default router;
