import assert from "node:assert/strict";
import test from "node:test";
import {
  BULK_DETECTION_STATUSES, BULK_FILE_IMPORT_STATUSES, BULK_IMPORT_BATCH_STATUSES,
  BULK_PROCESSING_STATUSES, BULK_UPLOAD_STATUSES, isOutdatedBatchConstraintError,
} from "./bulk-import-status";

test("bulk import status sets cover every runtime lifecycle value",()=>{
  for(const value of ["uploading","detecting","ready_for_review","importing","processing","completed","completed_with_errors","failed","cancelled"])assert.ok(BULK_IMPORT_BATCH_STATUSES.includes(value as any));
  for(const value of ["queued","uploading","uploaded","upload_failed"])assert.ok(BULK_UPLOAD_STATUSES.includes(value as any));
  for(const value of ["detecting","ready","needs_review","conflict","duplicate","unsupported","detection_failed","detection_timed_out"])assert.ok(BULK_DETECTION_STATUSES.includes(value as any));
  assert.ok(BULK_FILE_IMPORT_STATUSES.includes("import_failed"));assert.ok(BULK_PROCESSING_STATUSES.includes("needs_review"));
});
test("recognizes the stale database constraint error",()=>assert.equal(isOutdatedBatchConstraintError('violates check constraint "admin_import_batches_status_check"'),true));

