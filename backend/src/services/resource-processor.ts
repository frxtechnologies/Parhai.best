import type { SupabaseClient } from "@supabase/supabase-js";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { generateDocumentEmbeddings, AI_EMBEDDING_MODEL } from "../lib/ai-service";
import { createAndStoreQuestionScreenshots, screenshotMode } from "./question-screenshots";
import { tagQuestionsForSubject } from "./topic-tagging";

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
  return matches.length ? matches.reduce((total, match) => total + Number(match[1]), 0) : null;
}

export function cleanQuestionText(text: string) {
  return text
    .replace(/\b(?:DO NOT WRITE IN THIS MARGIN|TURN OVER|BLANK PAGE|UCLES|Cambridge University Press & Assessment)\b/gi, " ")
    .replace(/\b(?:INSTRUCTIONS|INFORMATION)\s+(?=(?:Answer|You must|Use a|Write|If you))/gi, " ")
    .replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, " ")
    .replace(/\b\d{4}\/(?:[0-9]{1,2}|[A-Z]{1,2})\/(?:M\/J|O\/N|F\/M)\/\d{2}\b/gi, " ")
    .replace(/\*+\s*\d+\s*\*+/g, " ")
    .replace(/(?:\u0000|\u0001|\u0002|\u0003)+/g, " ")
    .replace(/\.{5,}/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .replace(/[^\p{L}\p{N}\s()[\].,;:?!+\-=/°%'"£$]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function questionTextQuality(text: string): "good" | "acceptable" | "needs_review" | "failed" {
  const value = text.trim();
  if (/\b(answer all questions|write your name|blank page|do not write in this margin|instructions|information)\b/i.test(value)) return "failed";
  if (value.length < 20 || !/\b(calculate|explain|describe|state|determine|find|show|prove|draw|plot|write|complete|give)\b/i.test(value)) return "needs_review";
  return value.length >= 50 ? "good" : "acceptable";
}

function textQualityScore(status: ReturnType<typeof questionTextQuality>) {
  return status === "good" ? 0.95 : status === "acceptable" ? 0.75 : status === "needs_review" ? 0.35 : 0.10;
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

  const unique = new Map<string, IndexedQuestion>();
  for (const row of rows) {
    const questionText = row.lines.join(" ").replace(/\s+/g, " ").trim();
    const existing = unique.get(row.number);
    unique.set(row.number, existing
      ? { number: row.number, text: `${existing.text} ${questionText}`.trim(), marks: existing.marks ?? readMarks(questionText) }
      : { number: row.number, text: questionText, marks: readMarks(questionText) });
  }
  return [...unique.values()];
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
    const { data, error } = await client.from("question_index").update({
      answer_text: answer.text, marking_scheme_link_status: "linked", updated_at: new Date().toISOString(),
    })
      .eq("resource_id", paperResourceId).eq("question_number", answer.number).select("id");
    if (error) throw error;
    if (data?.length) {
      linked += data.length;
      continue;
    }
    const baseNumber = answer.number.match(/^\d+/)?.[0];
    if (!baseNumber) continue;
    const { data: partial, error: partialError } = await client.from("question_index").update({
      answer_text: answer.text, marking_scheme_link_status: "partial", updated_at: new Date().toISOString(),
    }).eq("resource_id", paperResourceId).like("question_number", `${baseNumber}(%`).is("answer_text", null).select("id");
    if (partialError) throw partialError;
    linked += partial?.length ?? 0;
  }
  return linked;
}

export async function processResourceContent(client: SupabaseClient, resource: ProcessableResource, onExtracted?: () => Promise<void>) {
  if (!resource.bucket?.trim() || !resource.storage_path?.trim()) {
    throw new Error(`Storage configuration is incomplete for resource ${resource.id}: bucket or file path is missing.`);
  }
  const { data: file, error: downloadError } = await client.storage.from(resource.bucket).download(resource.storage_path);
  if (downloadError || !file) {
    const reason = downloadError?.message === "Object not found" ? "file was not found" : "download failed";
    throw new Error(`Supabase Storage ${reason} for resource ${resource.id} (${resource.bucket}/${resource.storage_path}).`);
  }
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
  const questionBearing = ["PAST_PAPER", "WORKSHEET", "TEST", "TOPICAL"].includes(resource.resource_type);
  if (questionBearing && numbered.length === 0) {
    throw new Error("Question extraction failed: text was extracted, but no numbered questions were detected. Review the PDF or run OCR.");
  }

  if (questionBearing && numbered.length) {
    let classified = new Map();
    try {
      classified = await tagQuestionsForSubject(client, resource.subjects?.code ?? "", resource.subjects?.name ?? "Subject", numbered);
      const reviewCount = [...classified.values()].filter((tag) => tag.needsReview).length;
      if (reviewCount) classificationWarning = `${reviewCount} questions need topic review.`;
    } catch (error) {
      classificationWarning = error instanceof Error ? error.message : "AI topic classification failed.";
    }
    const { error: clearQuestionError } = await client.from("question_index").delete().eq("resource_id", resource.id);
    if (clearQuestionError) throw clearQuestionError;
    const cleanedTexts = numbered.map((question) => cleanQuestionText(question.text));
    const qualities = cleanedTexts.map((text) => questionTextQuality(text));
    // Embed eligible questions at ingestion so match_questions works immediately (F18).
    // Cost-aware: only good/acceptable rows are embedded (failed/needs_review are excluded
    // from retrieval anyway). Best-effort — the embed-question-index backfill fills any gaps.
    const questionEmbeddings = new Map<number, number[]>();
    const eligibleIndexes = qualities.flatMap((status, i) => (status === "good" || status === "acceptable") ? [i] : []);
    if (eligibleIndexes.length) {
      try {
        const embs = await generateDocumentEmbeddings(eligibleIndexes.map((i) => cleanedTexts[i]!.slice(0, 2000)));
        eligibleIndexes.forEach((i, k) => questionEmbeddings.set(i, embs[k]!));
      } catch {
        // Non-fatal: leave embeddings null; the backfill script populates them later.
      }
    }
    const { data: savedQuestions, error: questionError } = await client.from("question_index").insert(numbered.map((question, qi) => {
      const tag = classified.get(question.number);
      const cleanedText = cleanedTexts[qi]!;
      const textQuality = qualities[qi]!;
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
        total_marks: question.marks,
        raw_extracted_text: question.text,
        clean_question_text: cleanedText,
        display_question_text: cleanedText,
        question_text: cleanedText,
        text_quality_status: textQuality,
        text_quality_score: textQualityScore(textQuality),
        question_part: question.number.match(/(\(.+\))$/)?.[1] ?? null,
        marking_scheme_link_status: "unlinked",
        source_file: resource.original_filename,
        syllabus_reference: tag?.syllabusReference ?? null,
        confidence: tag?.confidence ?? 0,
        needs_review: textQuality === "needs_review" || textQuality === "failed" || (tag?.needsReview ?? true),
        tagging_method: tag?.method ?? "missing_map",
        tagging_note: tag?.note ?? "No topic map found for this subject.",
        topic_classified: Boolean(tag && !tag.needsReview && tag.confidence >= 0.85),
        student_verified: textQuality !== "needs_review" && textQuality !== "failed" && Boolean(tag && !tag.needsReview && tag.confidence >= 0.60),
        embedding: questionEmbeddings.has(qi) ? `[${questionEmbeddings.get(qi)!.join(",")}]` : null,
        embedding_model: questionEmbeddings.has(qi) ? AI_EMBEDDING_MODEL : null,
      };
    })).select("id,question_number");
    if (questionError) throw questionError;
    try {
      if (screenshotMode() !== "pre_generate") {
        await client.from("question_index").update({ screenshot_status: "not_generated" }).eq("resource_id", resource.id);
      } else {
      const screenshotResult = await createAndStoreQuestionScreenshots(client, resource, Buffer.from(await file.arrayBuffer()), savedQuestions ?? []);
      if (screenshotResult.needsReview) classificationWarning = [classificationWarning, `${screenshotResult.needsReview} question screenshots need crop review.`].filter(Boolean).join(" ");
      }
    } catch (error) {
      await client.from("question_index").update({ screenshot_status: "failed" }).eq("resource_id", resource.id);
      classificationWarning = [classificationWarning, `Question screenshots failed without blocking indexing: ${error instanceof Error ? error.message : "unknown renderer error"}`].filter(Boolean).join(" ");
    }
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
