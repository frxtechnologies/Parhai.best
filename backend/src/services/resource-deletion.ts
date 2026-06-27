import type { SupabaseClient } from "@supabase/supabase-js";

export type ResourceDeletionPreview = {
  id: number;
  title: string;
  originalFilename: string;
  storagePath: string;
  subjectId: number;
  subjectName: string;
  year: number | null;
  resourceType: string;
  indexedQuestions: number;
  searchableChunks: number;
  processingJobs: number;
};

async function exactCount(client: SupabaseClient, table: string, resourceId: number) {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("resource_id", resourceId);
  if (error) throw error;
  return count ?? 0;
}

export async function getResourceDeletionPreview(client: SupabaseClient, resourceId: number): Promise<ResourceDeletionPreview> {
  const { data: resource, error } = await client.from("resources")
    .select("id,title,original_filename,storage_path,subject_id,year,resource_type,subjects(name)")
    .eq("id", resourceId).single();
  if (error || !resource) throw error ?? new Error("Resource not found.");
  const [indexedQuestions, searchableChunks, processingJobs] = await Promise.all([
    exactCount(client, "question_index", resourceId),
    exactCount(client, "ai_chunks", resourceId),
    exactCount(client, "processing_jobs", resourceId),
  ]);
  const subject = Array.isArray(resource.subjects) ? resource.subjects[0] : resource.subjects;
  return {
    id: Number(resource.id),
    title: resource.title,
    originalFilename: resource.original_filename,
    storagePath: resource.storage_path,
    subjectId: Number(resource.subject_id),
    subjectName: subject?.name ?? "Unknown subject",
    year: resource.year,
    resourceType: resource.resource_type,
    indexedQuestions,
    searchableChunks,
    processingJobs,
  };
}

export async function permanentlyDeleteResource(client: SupabaseClient, resourceId: number) {
  const { data: resource, error } = await client.from("resources")
    .select("id,bucket,storage_path,file_type,subject_id,legacy_source,legacy_source_id")
    .eq("id", resourceId).single();
  if (error || !resource) throw error ?? new Error("Resource not found.");

  // Keep an in-memory backup so a failed database transaction can restore Storage.
  const { data: storedFile, error: downloadError } = await client.storage.from(resource.bucket).download(resource.storage_path);
  if (downloadError || !storedFile) throw new Error(`Storage deletion was cancelled: ${downloadError?.message ?? "file not found"}`);
  const backup = Buffer.from(await storedFile.arrayBuffer());

  const { error: storageError } = await client.storage.from(resource.bucket).remove([resource.storage_path]);
  if (storageError) throw new Error(`Storage deletion failed: ${storageError.message}`);

  const { data: result, error: databaseError } = await client.rpc("delete_resource_records", { p_resource_id: resourceId });
  if (!databaseError) {
    const folderEnd = resource.storage_path.lastIndexOf("/");
    const folder = folderEnd >= 0 ? resource.storage_path.slice(0, folderEnd) : "";
    const fileName = folderEnd >= 0 ? resource.storage_path.slice(folderEnd + 1) : resource.storage_path;
    const [storageAudit, resourceAudit, questionAudit, chunkAudit, jobAudit, legacyQuestionsAudit, legacyRecordAudit] = await Promise.all([
      client.storage.from(resource.bucket).list(folder, { search: fileName, limit: 100 }),
      client.from("resources").select("id", { count: "exact", head: true }).eq("id", resourceId),
      client.from("question_index").select("id", { count: "exact", head: true }).eq("resource_id", resourceId),
      client.from("ai_chunks").select("id", { count: "exact", head: true }).eq("resource_id", resourceId),
      client.from("processing_jobs").select("id", { count: "exact", head: true }).eq("resource_id", resourceId),
      resource.legacy_source === "papers" && resource.legacy_source_id
        ? client.from("questions").select("id", { count: "exact", head: true }).eq("paper_id", resource.legacy_source_id)
        : Promise.resolve({ count: 0, error: null }),
      resource.legacy_source && resource.legacy_source_id
        ? client.from(resource.legacy_source).select("id", { count: "exact", head: true }).eq("id", resource.legacy_source_id)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    const auditErrors = [storageAudit.error, resourceAudit.error, questionAudit.error, chunkAudit.error, jobAudit.error, legacyQuestionsAudit.error, legacyRecordAudit.error].filter(Boolean);
    if (auditErrors.length) throw new Error(`Post-delete audit failed: ${auditErrors.map((item) => item!.message).join("; ")}`);
    const storageFileRemoved = !(storageAudit.data ?? []).some((item) => item.name === fileName);
    const audit = {
      storageFileRemoved,
      resourceRowsRemaining: resourceAudit.count ?? 0,
      questionIndexRowsRemaining: questionAudit.count ?? 0,
      aiChunkRowsRemaining: chunkAudit.count ?? 0,
      processingJobRowsRemaining: jobAudit.count ?? 0,
      legacyQuestionRowsRemaining: legacyQuestionsAudit.count ?? 0,
      legacyResourceRowsRemaining: legacyRecordAudit.count ?? 0,
    };
    const incomplete = !audit.storageFileRemoved || Object.entries(audit).some(([key, value]) => key !== "storageFileRemoved" && value !== 0);
    if (incomplete) throw new Error(`Post-delete audit failed: ${JSON.stringify(audit)}`);
    return { ...(result as Record<string, unknown>), subjectId: Number(resource.subject_id), storageDeleted: true, audit };
  }

  // RPC calls are transactional. If its response was an error and the row still
  // exists, restore the file before returning so Storage and Postgres agree.
  const { data: remaining, error: verificationError } = await client.from("resources").select("id").eq("id", resourceId).maybeSingle();
  if (!verificationError && !remaining) {
    return { resourceId, subjectId: Number(resource.subject_id), storageDeleted: true, databaseDeleted: true };
  }
  const { error: restoreError } = await client.storage.from(resource.bucket).upload(resource.storage_path, backup, {
    contentType: resource.file_type ?? "application/octet-stream",
    upsert: false,
  });
  if (restoreError) {
    throw new Error(`Database deletion failed and Storage rollback also failed. Database: ${databaseError.message}. Storage rollback: ${restoreError.message}`);
  }
  throw new Error(`Database deletion failed; the Storage file was restored. ${databaseError.message}`);
}
