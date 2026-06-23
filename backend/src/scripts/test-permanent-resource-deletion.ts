import "dotenv/config";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
const [{ supabaseAdmin }, { getResourceDeletionPreview, permanentlyDeleteResource }] = await Promise.all([
  import("../lib/supabase"),
  import("../services/resource-deletion"),
]);

const { data: subject, error: subjectError } = await supabaseAdmin.from("subjects").select("id,level,board,name").order("id").limit(1).single();
if (subjectError || !subject) throw subjectError ?? new Error("A subject is required for deletion tests.");

const results: Array<Record<string, unknown>> = [];
const created: Array<{ id: number; path: string }> = [];
try {
for (const resourceType of ["NOTES", "PAST_PAPER", "MARKING_SCHEME"] as const) {
  const stamp = `${Date.now()}-${resourceType.toLowerCase()}`;
  const path = `deletion-tests/${stamp}.txt`;
  const file = Buffer.from(`Permanent deletion integration test: ${stamp}`);
  const { error: uploadError } = await supabaseAdmin.storage.from("resources").upload(path, file, { contentType: "text/plain", upsert: false });
  if (uploadError) throw uploadError;
  const { data: resource, error: resourceError } = await supabaseAdmin.from("resources").insert({
    subject_id: subject.id,
    level: subject.level,
    board: subject.board,
    title: `Deletion test ${resourceType}`,
    resource_type: resourceType,
    year: resourceType === "NOTES" ? null : 2099,
    session: resourceType === "NOTES" ? null : "MAY_JUNE",
    paper_code: resourceType === "NOTES" ? null : "99",
    variant: resourceType === "NOTES" ? null : 99,
    bucket: "resources",
    storage_path: path,
    file_path: path,
    file_url: path,
    original_filename: `${stamp}.txt`,
    file_type: "text/plain",
    file_size_bytes: file.length,
    extracted_text: file.toString("utf8"),
    status: "processed",
    processing_status: "processed",
  }).select("id").single();
  if (resourceError || !resource) throw resourceError ?? new Error("Could not create deletion test resource.");
  const resourceId = Number(resource.id);
  created.push({ id: resourceId, path });
  const { error: chunkError } = await supabaseAdmin.from("ai_chunks").insert({ subject_id: subject.id, resource_id: resourceId, chunk_index: 0, content: file.toString("utf8"), metadata: { deletionTest: true } });
  if (chunkError) throw chunkError;
  if (resourceType === "PAST_PAPER") {
    const { error: questionError } = await supabaseAdmin.from("question_index").insert([
      { subject_id: subject.id, resource_id: resourceId, year: 2099, session: "MAY_JUNE", paper_code: "99", variant: 99, question_number: "1", topic: "General Physics", difficulty: "MEDIUM", marks: 2, question_text: "Synthetic deletion test question one", source_file: `${stamp}.txt` },
      { subject_id: subject.id, resource_id: resourceId, year: 2099, session: "MAY_JUNE", paper_code: "99", variant: 99, question_number: "2", topic: "General Physics", difficulty: "MEDIUM", marks: 2, question_text: "Synthetic deletion test question two", source_file: `${stamp}.txt` },
    ]);
    if (questionError) throw questionError;
  }

  const preview = await getResourceDeletionPreview(supabaseAdmin, resourceId);
  const deletion = await permanentlyDeleteResource(supabaseAdmin, resourceId);
  const [{ count: resourcesLeft }, { count: questionsLeft }, { count: chunksLeft }, { count: jobsLeft }, storageResult] = await Promise.all([
    supabaseAdmin.from("resources").select("id", { count: "exact", head: true }).eq("id", resourceId),
    supabaseAdmin.from("question_index").select("id", { count: "exact", head: true }).eq("resource_id", resourceId),
    supabaseAdmin.from("ai_chunks").select("id", { count: "exact", head: true }).eq("resource_id", resourceId),
    supabaseAdmin.from("processing_jobs").select("id", { count: "exact", head: true }).eq("resource_id", resourceId),
    supabaseAdmin.storage.from("resources").download(path),
  ]);
  const verified = resourcesLeft === 0 && questionsLeft === 0 && chunksLeft === 0 && jobsLeft === 0 && Boolean(storageResult.error);
  if (!verified) throw new Error(`Deletion verification failed for ${resourceType}.`);
  results.push({ resourceType, previewQuestions: preview.indexedQuestions, ...deletion, verified });
  created.splice(created.findIndex((item) => item.id === resourceId), 1);
}

  const missingPath = `deletion-tests/missing-${Date.now()}.txt`;
  const { data: rollbackResource, error: rollbackInsertError } = await supabaseAdmin.from("resources").insert({
    subject_id: subject.id, level: subject.level, board: subject.board, title: "Deletion rollback test", resource_type: "NOTES",
    bucket: "resources", storage_path: missingPath, file_path: missingPath, file_url: missingPath,
    original_filename: "missing-file.txt", file_type: "text/plain", status: "processed", processing_status: "processed",
  }).select("id").single();
  if (rollbackInsertError || !rollbackResource) throw rollbackInsertError ?? new Error("Could not create rollback test.");
  const rollbackId = Number(rollbackResource.id);
  created.push({ id: rollbackId, path: missingPath });
  let storageFailureBlockedDatabase = false;
  try { await permanentlyDeleteResource(supabaseAdmin, rollbackId); }
  catch { const { data } = await supabaseAdmin.from("resources").select("id").eq("id", rollbackId).maybeSingle(); storageFailureBlockedDatabase = Boolean(data); }
  if (!storageFailureBlockedDatabase) throw new Error("Storage failure did not preserve the database resource.");
  results.push({ resourceType: "STORAGE_FAILURE_ROLLBACK", resourceId: rollbackId, verified: true });
} finally {
  for (const item of created) {
    await supabaseAdmin.storage.from("resources").remove([item.path]);
    await supabaseAdmin.from("resources").delete().eq("id", item.id);
  }
}
console.log(JSON.stringify(results));
