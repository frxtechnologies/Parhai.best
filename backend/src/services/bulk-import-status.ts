export const BULK_IMPORT_BATCH_STATUSES = [
  "uploading", "detecting", "ready_for_review", "importing", "processing",
  "completed", "completed_with_errors", "failed", "cancelled",
] as const;
export type BulkImportBatchStatus = typeof BULK_IMPORT_BATCH_STATUSES[number];

export const BULK_UPLOAD_STATUSES = ["queued", "uploading", "uploaded", "upload_failed", "cancelled"] as const;
export const BULK_DETECTION_STATUSES = [
  "queued", "detecting", "ready", "needs_review", "conflict", "duplicate",
  "unsupported", "detection_failed", "detection_timed_out", "cancelled",
] as const;
export const BULK_FILE_IMPORT_STATUSES = ["pending", "importing", "imported", "import_failed", "skipped", "cancelled"] as const;
export const BULK_PROCESSING_STATUSES = ["pending", "queued", "processing", "completed", "failed", "needs_review", "cancelled"] as const;

export function isOutdatedBatchConstraintError(message: string) {
  return /admin_import_batches_status_check|violates check constraint/i.test(message);
}

