import type { SupabaseClient } from "@supabase/supabase-js";
import { processResourceContent, type ProcessableResource } from "./resource-processor";
import { runKnowledgeCenterPostProcessing } from "./knowledge-center";

export async function processResourceById(client: SupabaseClient, resourceId: number) {
  const { data: resource, error } = await client.from("resources")
    .select("id,subject_id,level,board,title,resource_type,year,session,paper_code,variant,bucket,storage_path,file_type,original_filename,related_resource_id,visibility,is_approved,subjects(name,code,board)")
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
    const { error: completeJobError } = await client.from("processing_jobs").update({ status: "completed", error_message: result.classificationWarning, completed_at: completedAt, updated_at: completedAt }).eq("id", jobId);
    if (completeJobError) throw completeJobError;
    // Knowledge Center: resource-level topic classification, graph linking, and
    // training-candidate derivation. Best-effort — never fails an ingestion that
    // has already succeeded.
    const subjectCode = (Array.isArray(resource.subjects) ? resource.subjects[0] : resource.subjects)?.code as string | undefined;
    if (subjectCode) {
      await runKnowledgeCenterPostProcessing(
        client,
        { id: resourceId, subject_id: resource.subject_id, resource_type: resource.resource_type, title: resource.title, extracted_text: result.extractedText, visibility: (resource as { visibility?: string }).visibility ?? "PUBLIC", is_approved: (resource as { is_approved?: boolean }).is_approved ?? true },
        subjectCode,
      );
    }
    return result;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "Resource processing failed.";
    const failedAt = new Date().toISOString();
    await client.from("resources").update({ status: "failed", processing_status: "failed", processing_error: message, updated_at: failedAt }).eq("id", resourceId);
    await client.from("processing_jobs").update({ status: "failed", error_message: message, completed_at: failedAt, updated_at: failedAt }).eq("id", jobId);
    throw cause;
  }
}
