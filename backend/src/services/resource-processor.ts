import type { SupabaseClient } from "@supabase/supabase-js";
import pdf from "pdf-parse/lib/pdf-parse.js";
import {
  classifyQuestions,
  generateDocumentEmbeddings,
  AI_EMBEDDING_MODEL,
} from "../lib/ai-service";

export type ProcessableResource = {
  id: number;
  subject_id: number;
  level: "O_LEVEL" | "A_LEVEL";
  board: string;
  title: string;
  resource_type: string;
  year: number | null;
  session: string | null;
  paper_code: string | null;
  variant: number | null;
  bucket: string;
  storage_path: string;
  file_type: string | null;
  original_filename: string;
  related_resource_id: number | null;
  subjects: { name: string; code: string; board: string } | null;
};

export type IndexedQuestion = {
  number: string;
  text: string;
  marks: number | null;
};

export function normalizeResourceText(value: string) {
  return value.replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function splitResourceChunks(text: string, maxLength = 1400, overlap = 180) {
  const normalized = normalizeResourceText(text);
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxLength, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf("\n", end), normalized.lastIndexOf(". ", end));
      if (boundary > start + Math.floor(maxLength * 0.6)) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

function readMarks(text: string) {
  const matches = [...text.matchAll(/(?:\[|\()\s*(\d{1,2})\s*(?:marks?)?\s*(?:\]|\))/gi)];
  return matches.length ? Number(matches[matches.length - 1]![1]) : null;
}

export function splitNumberedQuestions(text: string): IndexedQuestion[] {
  const lines = normalizeResourceText(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const rows: Array<{ number: string; lines: string[] }> = [];
  let current: { number: string; lines: string[] } | null = null;
  let baseNumber: string | null = null;

  const flush = () => {
    if (current && current.lines.join(" ").trim().length >= 8) rows.push(current);
  };

  for (const line of lines) {
    const main = line.match(/^(?:question\s+|q\s*)?(\d{1,2})(?:\s*(\([a-z]\)(?:\([ivx]+\))?))?(?:[.):\-]|\s)+\s*(.*)$/i);
    const subpart = line.match(/^\(([a-z])\)(?:\s*\(([ivx]+)\))?\s*(.*)$/i);
    if (main && Number(main[1]) <= 99) {
      flush();
      baseNumber = String(Number(main[1]));
      current = { number: `${baseNumber}${main[2] ?? ""}`.replace(/\s/g, ""), lines: main[3] ? [main[3]] : [] };
      continue;
    }
    if (subpart && baseNumber) {
      flush();
      current = { number: `${baseNumber}(${subpart[1]!.toLowerCase()})${subpart[2] ? `(${subpart[2].toLowerCase()})` : ""}`, lines: subpart[3] ? [subpart[3]] : [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();

  return rows.map((row) => {
    const questionText = row.lines.join(" ").replace(/\s+/g, " ").trim();
    return { number: row.number, text: questionText, marks: readMarks(questionText) };
  });
}

async function extractFileText(resource: ProcessableResource, buffer: Buffer) {
  const lowerName = resource.original_filename.toLowerCase();
  const isPdf = resource.file_type === "application/pdf" || lowerName.endsWith(".pdf");
  const isText = resource.file_type?.startsWith("text/") || lowerName.endsWith(".txt");
  if (isPdf) return normalizeResourceText((await pdf(buffer)).text);
  if (isText) return normalizeResourceText(buffer.toString("utf8"));
  throw new Error("Only PDF and plain-text processing is supported.");
}

async function resolveQuestionPaper(client: SupabaseClient, resource: ProcessableResource) {
  if (resource.related_resource_id) return resource.related_resource_id;
  let query = client.from("resources").select("id")
    .eq("subject_id", resource.subject_id)
    .eq("level", resource.level)
    .eq("resource_type", "PAST_PAPER")
    .eq("year", resource.year);
  query = resource.session == null ? query.is("session", null) : query.eq("session", resource.session);
  query = resource.paper_code == null ? query.is("paper_code", null) : query.eq("paper_code", resource.paper_code);
  query = resource.variant == null ? query.is("variant", null) : query.eq("variant", resource.variant);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.id ? Number(data.id) : null;
}

async function linkAnswerRows(client: SupabaseClient, paperResourceId: number, answers: IndexedQuestion[]) {
  let linked = 0;
  for (const answer of answers) {
    const { data, error } = await client.from("question_index").update({ answer_text: answer.text, updated_at: new Date().toISOString() })
      .eq("resource_id", paperResourceId).eq("question_number", answer.number).select("id");
    if (error) throw error;
    linked += data?.length ?? 0;
  }
  return linked;
}

export async function processResourceContent(client: SupabaseClient, resource: ProcessableResource, onExtracted?: () => Promise<void>) {
  const { data: file, error: downloadError } = await client.storage.from(resource.bucket).download(resource.storage_path);
  if (downloadError || !file) throw downloadError ?? new Error("Resource file was not found in Supabase Storage.");
  const extractedText = await extractFileText(resource, Buffer.from(await file.arrayBuffer()));
  if (!extractedText) throw new Error("No text was extracted. This appears to be a scanned PDF and OCR is needed before it can be processed.");
  await onExtracted?.();

  const chunks = splitResourceChunks(extractedText);
  if (!chunks.length) throw new Error("No searchable text chunks could be created.");
  const embeddings = await generateDocumentEmbeddings(chunks);
  const metadata = {
    title: resource.title,
    subject: resource.subjects?.name,
    subjectCode: resource.subjects?.code,
    level: resource.level,
    board: resource.board || resource.subjects?.board,
    type: resource.resource_type,
    year: resource.year,
    session: resource.session,
    paperCode: resource.paper_code,
    variant: resource.variant,
    sourceFile: resource.original_filename,
  };

  const { error: clearChunkError } = await client.from("ai_chunks").delete().eq("resource_id", resource.id);
  if (clearChunkError) throw clearChunkError;
  const { error: chunkError } = await client.from("ai_chunks").insert(chunks.map((content, index) => ({
    subject_id: resource.subject_id,
    resource_id: resource.id,
    chunk_index: index,
    content,
    embedding: `[${embeddings[index]!.join(",")}]`,
    embedding_model: AI_EMBEDDING_MODEL,
    metadata,
  })));
  if (chunkError) throw chunkError;

  let indexedQuestions = 0;
  let linkedAnswers = 0;
  let classificationWarning: string | null = null;
  const numbered = splitNumberedQuestions(extractedText);

  if (["PAST_PAPER", "WORKSHEET", "TEST", "TOPICAL"].includes(resource.resource_type) && numbered.length) {
    let classified = new Map();
    try {
      classified = await classifyQuestions(resource.subjects?.name ?? "Subject", numbered.map(({ number, text }) => ({ number, text })));
    } catch (error) {
      classificationWarning = error instanceof Error ? error.message : "AI topic classification failed.";
    }
    const { error: clearQuestionError } = await client.from("question_index").delete().eq("resource_id", resource.id);
    if (clearQuestionError) throw clearQuestionError;
    const { error: questionError } = await client.from("question_index").insert(numbered.map((question) => {
      const tag = classified.get(question.number);
      return {
        subject_id: resource.subject_id,
        resource_id: resource.id,
        year: resource.year,
        session: resource.session,
        paper_code: resource.paper_code,
        variant: resource.variant,
        question_number: question.number,
        topic: tag?.topic ?? "Unclassified",
        subtopic: tag?.subtopic ?? null,
        difficulty: tag?.difficulty ?? "MEDIUM",
        marks: question.marks,
        question_text: question.text,
        source_file: resource.original_filename,
      };
    }));
    if (questionError) throw questionError;
    indexedQuestions = numbered.length;
    if (resource.resource_type === "PAST_PAPER") {
      const { data: schemes, error: schemeError } = await client.from("resources").select("extracted_text")
        .eq("resource_type", "MARKING_SCHEME").eq("related_resource_id", resource.id).not("extracted_text", "is", null);
      if (schemeError) throw schemeError;
      for (const scheme of schemes ?? []) linkedAnswers += await linkAnswerRows(client, resource.id, splitNumberedQuestions(scheme.extracted_text));
    }
  }

  if (resource.resource_type === "MARKING_SCHEME" && numbered.length) {
    const paperResourceId = await resolveQuestionPaper(client, resource);
    if (!paperResourceId) classificationWarning = "Marking scheme processed but not linked yet. Upload a past paper with the same subject, level, year, session, paper code, and variant.";
    else linkedAnswers += await linkAnswerRows(client, paperResourceId, numbered);
  }

  return { extractedText, chunks: chunks.length, embeddings: embeddings.length, indexedQuestions, linkedAnswers, classificationWarning };
}
