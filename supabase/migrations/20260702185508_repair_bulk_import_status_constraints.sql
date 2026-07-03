alter table public.admin_import_batches drop constraint if exists admin_import_batches_status_check;
alter table public.admin_import_batches add constraint admin_import_batches_status_check
  check(status in ('uploading','detecting','ready_for_review','importing','processing','completed','completed_with_errors','failed','cancelled','previewed'));

do $$
begin
  if to_regclass('public.import_batch_files') is not null then
    alter table public.import_batch_files drop constraint if exists import_batch_files_upload_status_check;
    alter table public.import_batch_files add constraint import_batch_files_upload_status_check
      check(upload_status in ('queued','uploading','uploaded','upload_failed','cancelled'));
    alter table public.import_batch_files drop constraint if exists import_batch_files_detection_status_check;
    alter table public.import_batch_files add constraint import_batch_files_detection_status_check
      check(detection_status in ('queued','detecting','ready','needs_review','conflict','duplicate','unsupported','detection_failed','detection_timed_out','cancelled'));
    alter table public.import_batch_files drop constraint if exists import_batch_files_import_status_check;
    alter table public.import_batch_files add constraint import_batch_files_import_status_check
      check(import_status in ('pending','importing','imported','import_failed','skipped','cancelled'));
    alter table public.import_batch_files drop constraint if exists import_batch_files_processing_status_check;
    alter table public.import_batch_files add constraint import_batch_files_processing_status_check
      check(processing_status in ('pending','queued','processing','completed','failed','needs_review','cancelled'));
  end if;
end $$;
