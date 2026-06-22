import { Router, type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../middleware/auth";
import { processResourceContent, type ProcessableResource } from "../services/resource-processor";

const router: IRouter = Router();

router.post("/resources/:resourceId/process", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }

  try {
    const { data: resource, error } = await client.from("resources")
      .select("id,subject_id,level,board,title,resource_type,year,session,paper_code,variant,bucket,storage_path,file_type,original_filename,related_resource_id,subjects(name,code,board)")
      .eq("id", resourceId).single();
    if (error || !resource) { res.status(404).json({ error: "Resource not found." }); return; }

    const now = new Date().toISOString();
    const { data: previousJob } = await client.from("processing_jobs").select("id,status,retry_count")
      .eq("resource_id", resourceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    let jobId: number;
    if (previousJob && ["uploaded", "extracting", "indexing"].includes(previousJob.status)) {
      jobId = Number(previousJob.id);
      const { error: jobError } = await client.from("processing_jobs").update({ status: "extracting", error_message: null, started_at: now, updated_at: now }).eq("id", jobId);
      if (jobError) throw jobError;
    } else {
      const { data: job, error: jobError } = await client.from("processing_jobs").insert({ resource_id: resourceId, status: "extracting", retry_count: Number(previousJob?.retry_count ?? 0) + 1, started_at: now }).select("id").single();
      if (jobError || !job) throw jobError ?? new Error("Could not create processing job.");
      jobId = Number(job.id);
    }
    const { error: processingError } = await client.from("resources").update({ status: "processing", processing_status: "processing", processing_error: null, updated_at: new Date().toISOString() }).eq("id", resourceId);
    if (processingError) throw processingError;

    const result = await processResourceContent(client, resource as unknown as ProcessableResource, async () => {
      const { error: indexingError } = await client.from("processing_jobs").update({ status: "indexing", updated_at: new Date().toISOString() }).eq("id", jobId);
      if (indexingError) throw indexingError;
    });
    const completedAt = new Date().toISOString();
    const { error: updateError } = await client.from("resources").update({ extracted_text: result.extractedText, status: "processed", processing_status: "processed", processing_error: result.classificationWarning, updated_at: completedAt }).eq("id", resourceId);
    if (updateError) throw updateError;
    const { error: completeJobError } = await client.from("processing_jobs").update({ status: "completed", error_message: result.classificationWarning, completed_at: completedAt, updated_at: completedAt }).eq("id", jobId);
    if (completeJobError) throw completeJobError;
    req.log.info({ resourceId, ...result }, "Resource processing completed");
    res.json({ resourceId, extractedCharacters: result.extractedText.length, ...result, extractedText: undefined });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message
      : cause && typeof cause === "object" && "message" in cause ? String(cause.message)
        : "Resource processing failed.";
    req.log.error({ resourceId, error: cause }, "Resource processing failed");
    await client.from("resources").update({ status: "failed", processing_status: "failed", processing_error: message, updated_at: new Date().toISOString() }).eq("id", resourceId);
    const { data: job } = await client.from("processing_jobs").select("id").eq("resource_id", resourceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (job) await client.from("processing_jobs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    res.status(422).json({ error: message });
  }
});

router.get("/resources/:resourceId/questions", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }
  const { data, error } = await client.from("question_index")
    .select("id,question_number,topic,subtopic,difficulty,marks,question_text,answer_text,source_file")
    .eq("resource_id", resourceId).order("id");
  if (error) { res.status(422).json({ error: error.message }); return; }
  res.json({ questions: data ?? [] });
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
