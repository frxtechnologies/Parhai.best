import { Router, type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { requireAdmin } from "../middleware/auth";
import { generateDocumentEmbeddings, GEMINI_EMBEDDING_MODEL } from "../lib/gemini";

const router: IRouter = Router();

function normalizeText(value: string) {
  return value.replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function splitIntoChunks(text: string, maxLength = 1400, overlap = 180) {
  const normalized = normalizeText(text);
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

router.post("/resources/:resourceId/process", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }

  try {
    const { data: resource, error } = await client.from("resources")
      .select("id,subject_id,level,title,resource_type,year,session,paper_code,variant,bucket,storage_path,file_type,original_filename")
      .eq("id", resourceId).single();
    if (error || !resource) { res.status(404).json({ error: "Resource not found." }); return; }

    const { error: processingError } = await client.from("resources").update({ status: "processing", processing_status: "processing", processing_error: null, updated_at: new Date().toISOString() }).eq("id", resourceId);
    if (processingError) throw processingError;
    const { data: file, error: downloadError } = await client.storage.from(resource.bucket).download(resource.storage_path);
    if (downloadError || !file) throw downloadError ?? new Error("Resource file was not found in Storage.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const isPdf = resource.file_type === "application/pdf" || resource.original_filename.toLowerCase().endsWith(".pdf");
    const isText = resource.file_type?.startsWith("text/") || resource.original_filename.toLowerCase().endsWith(".txt");
    const extractedText = isPdf ? (await pdf(buffer)).text : isText ? buffer.toString("utf8") : "";
    if (!extractedText.trim()) throw new Error("Text extraction is supported for text-based PDFs and plain-text files. This file may require OCR.");

    const chunks = splitIntoChunks(extractedText);
    if (!chunks.length) throw new Error("No searchable text chunks could be created.");
    const embeddings = await generateDocumentEmbeddings(chunks);
    const { error: clearError } = await client.from("ai_chunks").delete().eq("resource_id", resourceId);
    if (clearError) throw clearError;
    const { error: chunkError } = await client.from("ai_chunks").insert(chunks.map((content, index) => ({
      subject_id: resource.subject_id,
      resource_id: resource.id,
      chunk_index: index,
      content,
      embedding: `[${embeddings[index]!.join(",")}]`,
      embedding_model: GEMINI_EMBEDDING_MODEL,
      metadata: { title: resource.title, type: resource.resource_type, year: resource.year, session: resource.session, paperCode: resource.paper_code, variant: resource.variant },
    })));
    if (chunkError) throw chunkError;
    const { error: updateError } = await client.from("resources").update({ extracted_text: normalizeText(extractedText), status: "processed", processing_status: "processed", processing_error: null, updated_at: new Date().toISOString() }).eq("id", resourceId);
    if (updateError) throw updateError;
    req.log.info({ resourceId, chunks: chunks.length, embeddingModel: GEMINI_EMBEDDING_MODEL }, "Resource processing completed");
    res.json({ resourceId, extractedCharacters: extractedText.length, chunks: chunks.length, embeddings: embeddings.length, embeddingModel: GEMINI_EMBEDDING_MODEL });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Resource processing failed.";
    req.log.error({ resourceId, error: cause }, "Resource processing failed");
    await client.from("resources").update({ status: "failed", processing_status: "failed", processing_error: message, updated_at: new Date().toISOString() }).eq("id", resourceId);
    res.status(422).json({ error: message });
  }
});

router.delete("/resources/:resourceId", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const resourceId = Number(req.params.resourceId);
  const { data: resource, error } = await client.from("resources").select("id,bucket,storage_path").eq("id", resourceId).single();
  if (error || !resource) { res.status(404).json({ error: "Resource not found." }); return; }
  const { error: storageError } = await client.storage.from(resource.bucket).remove([resource.storage_path]);
  if (storageError) { res.status(422).json({ error: storageError.message }); return; }
  const { error: deleteError } = await client.from("resources").delete().eq("id", resourceId);
  if (deleteError) { res.status(422).json({ error: deleteError.message }); return; }
  res.status(204).send();
});

export default router;
