import "dotenv/config";

const { supabaseAdmin } = await import("../lib/supabase");
const { processResourceContent } = await import("../services/resource-processor");

const { data: subjects, error: subjectError } = await supabaseAdmin.from("subjects").select("id").ilike("name", "%physics%");
if (subjectError) throw subjectError;
const subjectIds = (subjects ?? []).map((subject) => Number(subject.id));
if (!subjectIds.length) throw new Error("No Physics subject exists.");

const requestedIds = (process.env.RESOURCE_IDS ?? "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0);
let resourceQuery = supabaseAdmin.from("resources")
  .select("id,subject_id,level,board,title,resource_type,year,session,paper_code,variant,bucket,storage_path,file_type,original_filename,related_resource_id,processing_status,subjects(name,code,board)")
  .in("subject_id", subjectIds);
resourceQuery = requestedIds.length
  ? resourceQuery.in("id", requestedIds)
  : resourceQuery.or("processing_status.in.(pending,failed),processing_error.ilike.%rate limit%");
const { data: resources, error: resourceError } = await resourceQuery.order("created_at");
if (resourceError) throw resourceError;

let completed = 0;
let failed = 0;
for (const resource of resources ?? []) {
  const startedAt = new Date().toISOString();
  const { data: previousJob } = await supabaseAdmin.from("processing_jobs").select("id,retry_count")
    .eq("resource_id", resource.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: job, error: jobError } = await supabaseAdmin.from("processing_jobs").insert({
    resource_id: resource.id,
    status: "extracting",
    retry_count: Number(previousJob?.retry_count ?? 0) + 1,
    started_at: startedAt,
  }).select("id").single();
  if (jobError || !job) throw jobError ?? new Error("Could not create processing job.");
  await supabaseAdmin.from("resources").update({ status: "processing", processing_status: "processing", processing_error: null, updated_at: startedAt }).eq("id", resource.id);

  try {
    const result = await processResourceContent(supabaseAdmin, resource as any, async () => {
      const { error } = await supabaseAdmin.from("processing_jobs").update({ status: "indexing", updated_at: new Date().toISOString() }).eq("id", job.id);
      if (error) throw error;
    });
    const finishedAt = new Date().toISOString();
    await supabaseAdmin.from("resources").update({ extracted_text: result.extractedText, status: "processed", processing_status: "processed", processing_error: result.classificationWarning, updated_at: finishedAt }).eq("id", resource.id);
    await supabaseAdmin.from("processing_jobs").update({ status: "completed", error_message: result.classificationWarning, completed_at: finishedAt, updated_at: finishedAt }).eq("id", job.id);
    completed += 1;
    console.log(JSON.stringify({ resourceId: resource.id, status: "completed", chunks: result.chunks, questions: result.indexedQuestions, linkedAnswers: result.linkedAnswers, warning: result.classificationWarning }));
  } catch (error) {
    const message = error instanceof Error ? error.message
      : error && typeof error === "object" && "message" in error ? String(error.message)
        : "Processing failed.";
    const failedAt = new Date().toISOString();
    await supabaseAdmin.from("resources").update({ status: "failed", processing_status: "failed", processing_error: message, updated_at: failedAt }).eq("id", resource.id);
    await supabaseAdmin.from("processing_jobs").update({ status: "failed", error_message: message, completed_at: failedAt, updated_at: failedAt }).eq("id", job.id);
    failed += 1;
    console.error(JSON.stringify({ resourceId: resource.id, status: "failed", error: message }));
  }
}

console.log(JSON.stringify({ attempted: resources?.length ?? 0, completed, failed }));
if (failed) process.exitCode = 2;
