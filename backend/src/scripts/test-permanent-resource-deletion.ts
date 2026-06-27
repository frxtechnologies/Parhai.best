import "dotenv/config";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
const [{ supabaseAdmin }, { getResourceDeletionPreview, permanentlyDeleteResource }] = await Promise.all([
  import("../lib/supabase"),
  import("../services/resource-deletion"),
]);

const { data: subject, error: subjectError } = await supabaseAdmin.from("subjects").select("id,level,board,name").order("id").limit(1).single();
if (subjectError || !subject) throw subjectError ?? new Error("A subject is required for deletion tests.");
const { data: profile } = await supabaseAdmin.from("profiles").select("id").order("created_at").limit(1).maybeSingle();

const results: Array<Record<string, unknown>> = [];
const created: Array<{ id: number; path: string }> = [];
const createdChatIds: number[] = [];
const createdLogIds: number[] = [];
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
  const { data: chunk, error: chunkError } = await supabaseAdmin.from("ai_chunks").insert({ subject_id: subject.id, resource_id: resourceId, chunk_index: 0, content: file.toString("utf8"), metadata: { deletionTest: true } }).select("id").single();
  if (chunkError || !chunk) throw chunkError ?? new Error("Could not create test chunk.");
  if (resourceType === "PAST_PAPER") {
    const { data: indexedQuestions, error: questionError } = await supabaseAdmin.from("question_index").insert([
      { subject_id: subject.id, resource_id: resourceId, year: 2099, session: "MAY_JUNE", paper_code: "99", variant: 99, question_number: "1", topic: "General Physics", difficulty: "MEDIUM", marks: 2, question_text: "Synthetic deletion test question one", source_file: `${stamp}.txt` },
      { subject_id: subject.id, resource_id: resourceId, year: 2099, session: "MAY_JUNE", paper_code: "99", variant: 99, question_number: "2", topic: "General Physics", difficulty: "MEDIUM", marks: 2, question_text: "Synthetic deletion test question two", source_file: `${stamp}.txt` },
    ]).select("id");
    if (questionError) throw questionError;
    if (profile && indexedQuestions?.length) {
      const staleSources = [
        { sourceType: "resource", chunkId: chunk.id, resourceId },
        { sourceType: "question", chunkId: indexedQuestions[0]!.id, resourceId },
        { sourceType: "topic", chunkId: 999999, reference: "Unrelated source that must remain" },
      ];
      const { data: chat, error: chatError } = await supabaseAdmin.from("chat_messages").insert({ user_id: profile.id, subject_id: subject.id, role: "assistant", content: "Deletion citation cleanup test", sources: staleSources }).select("id").single();
      if (chatError || !chat) throw chatError ?? new Error("Could not create chat cleanup test.");
      createdChatIds.push(Number(chat.id));
      const { data: log, error: logError } = await supabaseAdmin.from("ai_chat_logs").insert({ user_id: profile.id, subject_id: subject.id, user_question: "Deletion test", ai_answer: "Deletion test", sources_used: staleSources }).select("id").single();
      if (logError || !log) throw logError ?? new Error("Could not create audit cleanup test.");
      createdLogIds.push(Number(log.id));
    }
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
  if (resourceType === "PAST_PAPER" && createdChatIds.length && createdLogIds.length) {
    const [{ data: chat }, { data: log }] = await Promise.all([
      supabaseAdmin.from("chat_messages").select("sources").eq("id", createdChatIds[createdChatIds.length - 1]!).single(),
      supabaseAdmin.from("ai_chat_logs").select("sources_used").eq("id", createdLogIds[createdLogIds.length - 1]!).single(),
    ]);
    if (!Array.isArray(chat?.sources) || chat.sources.length !== 1 || !Array.isArray(log?.sources_used) || log.sources_used.length !== 1) throw new Error(`Stale chat source references were not cleaned correctly. ${JSON.stringify({ chat: chat?.sources, log: log?.sources_used, deletion })}`);
  }
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
  if (createdChatIds.length) await supabaseAdmin.from("chat_messages").delete().in("id", createdChatIds);
  if (createdLogIds.length) await supabaseAdmin.from("ai_chat_logs").delete().in("id", createdLogIds);
  for (const item of created) {
    await supabaseAdmin.storage.from("resources").remove([item.path]);
    await supabaseAdmin.from("resources").delete().eq("id", item.id);
  }
}
console.log(JSON.stringify(results));
