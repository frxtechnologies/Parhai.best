import type { SupabaseClient } from "@supabase/supabase-js";

export type ResourceDeletionPreview = {
  id: number;
  title: string;
  originalFilename: string;
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
    .select("id,title,original_filename,subject_id,year,resource_type,subjects(name)")
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
    .select("id,bucket,storage_path,file_type,subject_id")
    .eq("id", resourceId).single();
  if (error || !resource) throw error ?? new Error("Resource not found.");

  // Keep an in-memory backup so a failed database transaction can restore Storage.
  const { data: storedFile, error: downloadError } = await client.storage.from(resource.bucket).download(resource.storage_path);
  if (downloadError || !storedFile) throw new Error(`Storage deletion was cancelled: ${downloadError?.message ?? "file not found"}`);
  const backup = Buffer.from(await storedFile.arrayBuffer());

  const { error: storageError } = await client.storage.from(resource.bucket).remove([resource.storage_path]);
  if (storageError) throw new Error(`Storage deletion failed: ${storageError.message}`);

  const { data: result, error: databaseError } = await client.rpc("delete_resource_records", { p_resource_id: resourceId });
  if (!databaseError) return { ...(result as Record<string, unknown>), subjectId: Number(resource.subject_id), storageDeleted: true };

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
