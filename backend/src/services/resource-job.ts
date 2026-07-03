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
    const result = await processResourceContent(client, resource as unknown as ProcessableResource, async (step,progress) => {
      const{data:current}=await client.from("processing_jobs").select("safe_logs").eq("id",jobId).single();
      const logs=Array.isArray(current?.safe_logs)?current.safe_logs.slice(-24):[];
      const { error: indexingError } = await client.from("processing_jobs").update({
        status:step,current_step:step,progress_percent:progress,
        safe_logs:[...logs,{step,progress,at:new Date().toISOString()}],updated_at:new Date().toISOString(),
      }).eq("id", jobId);
      if (indexingError) throw indexingError;
    });
    // Analytics are calculated from question_index on demand. Clearing caches
    // makes every completed upload visible immediately without model training.
    await client.from("paper_analyses").delete().eq("resource_id",resourceId);
    await client.from("repeated_topic_stats").delete().eq("subject_id",resource.subject_id);
    const completedAt = new Date().toISOString();
    const topicStatus = result.indexedQuestions
      ? result.classificationWarning ? "needs_review" : "classified"
      : "not_applicable";
    const linkStatus = resource.resource_type === "MARKING_SCHEME"
      ? result.linkedAnswers > 0 ? "linked" : "not_linked"
      : resource.resource_type === "PAST_PAPER" ? "paper_indexed" : "not_applicable";
    const { error: updateError } = await client.from("resources").update({
      extracted_text: result.extractedText,
      extracted_text_length: result.extractedText.length,
      detected_question_count: result.indexedQuestions,
      saved_question_count: result.indexedQuestions,
      topic_tagging_status: topicStatus,
      marking_scheme_link_status: linkStatus,
      status: "processed",
      processing_status: "processed",
      processing_error: result.classificationWarning,
      updated_at: completedAt,
    }).eq("id", resourceId);
    if (updateError) throw updateError;
    const finalStatus=result.classificationWarning?"needs_manual_review":"completed";
    const { error: completeJobError } = await client.from("processing_jobs").update({ status: finalStatus,current_step:finalStatus,progress_percent:100, error_message: result.classificationWarning, completed_at: completedAt, updated_at: completedAt }).eq("id", jobId);
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
