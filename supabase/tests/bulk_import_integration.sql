begin;
create temporary table bulk_test_assertions(hash_duplicate_blocked boolean default false, exam_duplicate_blocked boolean default false);
insert into bulk_test_assertions default values;

insert into public.admin_import_batches(status,total_files,report)
values ('importing',3,'{"test":"bulk-auto-import"}'::jsonb);

insert into public.resources(subject_id,title,resource_type,year,session,paper_code,paper_number,variant,bucket,storage_path,file_path,file_url,original_filename,file_type,status,processing_status,file_hash,import_batch_id)
values (9,'Bulk test paper','PAST_PAPER',2098,'MAY_JUNE','9',9,9,'resources','bulk-test/paper.pdf','bulk-test/paper.pdf','bulk-test/paper.pdf','0403_s98_qp_99.pdf','application/pdf','uploaded','pending','bulk-test-paper-hash',
  (select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1));

insert into public.resources(subject_id,title,resource_type,year,session,paper_code,paper_number,variant,bucket,storage_path,file_path,file_url,original_filename,file_type,status,processing_status,file_hash,import_batch_id)
values
  (9,'Bulk test scheme','MARKING_SCHEME',2098,'MAY_JUNE','9',9,9,'resources','bulk-test/scheme.pdf','bulk-test/scheme.pdf','bulk-test/scheme.pdf','0403_s98_ms_99.pdf','application/pdf','uploaded','pending','bulk-test-scheme-hash',
    (select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1)),
  (9,'Bulk test threshold','GRADE_THRESHOLD',2098,'MAY_JUNE',null,null,null,'resources','bulk-test/threshold.pdf','bulk-test/threshold.pdf','bulk-test/threshold.pdf','0403_s98_gt.pdf','application/pdf','uploaded','pending','bulk-test-threshold-hash',
    (select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1));

do $$
begin
  begin
    insert into public.resources(subject_id,title,resource_type,year,session,paper_number,variant,bucket,storage_path,file_path,file_url,original_filename,status,processing_status,file_hash,import_batch_id)
    values (9,'Hash duplicate','PAST_PAPER',2097,'MAY_JUNE',8,8,'resources','bulk-test/hash-duplicate.pdf','bulk-test/hash-duplicate.pdf','bulk-test/hash-duplicate.pdf','hash-duplicate.pdf','uploaded','pending','bulk-test-paper-hash',
      (select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1));
  exception when unique_violation then update bulk_test_assertions set hash_duplicate_blocked=true;
  end;
  begin
    insert into public.resources(subject_id,title,resource_type,year,session,paper_number,variant,bucket,storage_path,file_path,file_url,original_filename,status,processing_status,file_hash,import_batch_id)
    values (9,'Exam duplicate','PAST_PAPER',2098,'MAY_JUNE',9,9,'resources','bulk-test/exam-duplicate.pdf','bulk-test/exam-duplicate.pdf','bulk-test/exam-duplicate.pdf','exam-duplicate.pdf','uploaded','pending','bulk-test-exam-duplicate-hash',
      (select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1));
  exception when unique_violation then update bulk_test_assertions set exam_duplicate_blocked=true;
  end;
end;
$$;

select json_build_object(
  'resources',(select count(*) from public.resources where import_batch_id=(select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1)),
  'jobs',(select count(*) from public.processing_jobs where resource_id in (select id from public.resources where import_batch_id=(select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1))),
  'scheme_links',(select count(*) from public.resource_links where link_type='MARKING_SCHEME' and source_resource_id in (select id from public.resources where import_batch_id=(select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1))),
  'threshold_links',(select count(*) from public.resource_links where link_type='GRADE_THRESHOLD' and source_resource_id in (select id from public.resources where import_batch_id=(select id from public.admin_import_batches where report->>'test'='bulk-auto-import' order by id desc limit 1))),
  'hash_duplicate_blocked',(select hash_duplicate_blocked from bulk_test_assertions),
  'exam_duplicate_blocked',(select exam_duplicate_blocked from bulk_test_assertions)
) as verification;

rollback;
