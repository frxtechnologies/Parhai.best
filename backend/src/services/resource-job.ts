import type { SupabaseClient } from "@supabase/supabase-js";
import { processResourceContent, type ProcessableResource } from "./resource-processor";

export async function processResourceById(client: SupabaseClient, resourceId: number) {
  const { data: resource, error } = await client.from("resources")
    .select("id,subject_id,level,board,title,resource_type,year,session,paper_code,variant,bucket,storage_path,file_type,original_filename,related_resource_id,subjects(name,code,board)")
    .eq("id", resourceId).single();
  if (error || !resource) throw error ?? new Error("Resource not found.");

  const now = new Date().toISOString();
  const { data: previousJob, error: previousJobError } = await client.from("processing_jobs").select("id,status,retry_count")
    .eq("resource_id", resourceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previousJobError) throw previousJobError;
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

  try {
    const { error: processingError } = await client.from("resources").update({ status: "processing", processing_status: "processing", processing_error: null, updated_at: now }).eq("id", resourceId);
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
    return result;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "Resource processing failed.";
    const failedAt = new Date().toISOString();
    await client.from("resources").update({ status: "failed", processing_status: "failed", processing_error: message, updated_at: failedAt }).eq("id", resourceId);
    await client.from("processing_jobs").update({ status: "failed", error_message: message, completed_at: failedAt, updated_at: failedAt }).eq("id", jobId);
    throw cause;
  }
}
