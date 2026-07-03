import { createHash, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import multer from "multer";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { requireAdmin } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { detectResourceMetadata } from "../services/metadata-detector";
import { isOutdatedBatchConstraintError, type BulkImportBatchStatus } from "../services/bulk-import-status";

const router: IRouter = Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:1}});
const safeName=(value:string)=>value.replace(/[^a-zA-Z0-9._-]+/g,"_").replace(/^_+|_+$/g,"").slice(-180)||"resource.pdf";
const detectionTimeout=Math.max(5,Number(process.env.BULK_DETECTION_TIMEOUT_SECONDS??20))*1000;
const pageLimit=Math.max(1,Math.min(3,Number(process.env.BULK_DETECTION_PAGE_LIMIT??3)));

async function refreshBatch(batchId:number){
  const{data}=await supabaseAdmin.from("import_batch_files").select("upload_status,detection_status,import_status,processing_status").eq("import_batch_id",batchId);
  const rows=data??[],count=(field:string,values:string[])=>rows.filter((row:any)=>values.includes(String(row[field]))).length;
  const summary={
    uploaded_count:count("upload_status",["uploaded"]),ready_count:count("detection_status",["ready"]),
    needs_review_count:count("detection_status",["needs_review","detection_failed","detection_timed_out"]),
    conflict_count:count("detection_status",["conflict"]),duplicate_count:count("detection_status",["duplicate"]),
    failed_count:count("upload_status",["upload_failed"])+count("import_status",["import_failed"]),
    imported_count:count("import_status",["imported"]),processing_count:count("processing_status",["queued","processing"]),
    completed_count:count("processing_status",["completed"]),updated_at:new Date().toISOString(),
  };
  const reviewable=summary.uploaded_count===rows.length;
  const status:BulkImportBatchStatus=reviewable?"ready_for_review":"uploading";
  await supabaseAdmin.from("admin_import_batches").update({...summary,status}).eq("id",batchId);
  return summary;
}

router.post("/bulk-import/batches",requireAdmin,async(req,res)=>{
  const total=Math.max(0,Number(req.body?.totalFiles??0));
  const{data,error}=await supabaseAdmin.from("admin_import_batches").insert({created_by:res.locals.user.id,status:"uploading",total_files:total}).select("*").single();
  if(error||!data){const raw=error?.message??"Could not create import batch.";res.status(422).json({error:isOutdatedBatchConstraintError(raw)?"Bulk import setup error: database status constraint is outdated. Please run the latest migration.":raw,adminDetails:raw});return}res.status(201).json(data);
});

router.get("/bulk-import/batches/:batchId",requireAdmin,async(req,res)=>{
  const batchId=Number(req.params.batchId);
  const[{data:batch,error},{data:files}]=await Promise.all([
    supabaseAdmin.from("admin_import_batches").select("*").eq("id",batchId).single(),
    supabaseAdmin.from("import_batch_files").select("*").eq("import_batch_id",batchId).order("id"),
  ]);
  if(error||!batch){res.status(404).json({error:"Import batch not found."});return}res.json({batch,files:files??[]});
});

async function detectPersistedFile(fileRow:any,buffer?:Buffer){
  let bytes=buffer;
  if(!bytes){
    const{data,error}=await supabaseAdmin.storage.from(fileRow.storage_bucket).download(fileRow.storage_path);
    if(error||!data)throw new Error("Uploaded PDF could not be read from storage.");
    bytes=Buffer.from(await data.arrayBuffer());
  }
  const filenameOnly=detectResourceMetadata(fileRow.original_filename);
  const canonical=filenameOnly.status==="Ready"&&filenameOnly.confidence>=90;
  let detected=filenameOnly;
  let timedOut=false;
  if(!canonical){
    try{
      const parsed=await Promise.race([
        pdf(bytes,{max:pageLimit}),
        new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("detection_timeout")),detectionTimeout)),
      ]);
      detected=detectResourceMetadata(fileRow.original_filename,parsed.text);
    }catch(error){
      timedOut=error instanceof Error&&error.message==="detection_timeout";
      detected={...filenameOnly,status:"Needs Review",warnings:[timedOut?`Detection timed out after ${detectionTimeout/1000} seconds. File is saved; complete metadata manually.`:"PDF text could not be read. File is saved; detection used filename only."]};
    }
  }
  const metadata=detected.metadata as Record<string,any>;
  let subjectId:number|null=null,subjectName=metadata.subjectName??null,level=metadata.level??null;
  if(metadata.syllabusCode){
    const{data:mapping}=await supabaseAdmin.from("subject_code_map").select("subject_id,subjects(name,level)").eq("subject_code",String(metadata.syllabusCode)).maybeSingle();
    const subject=Array.isArray(mapping?.subjects)?mapping.subjects[0]:mapping?.subjects;
    subjectId=mapping?.subject_id?Number(mapping.subject_id):null;subjectName=subject?.name??subjectName;level=subject?.level??level;
  }
  let duplicateId:number|null=null;
  if(subjectId&&metadata.year&&metadata.session&&metadata.resourceType){
    let query=supabaseAdmin.from("resources").select("id").eq("subject_id",subjectId).eq("level",level).eq("year",metadata.year).eq("session",metadata.session).eq("resource_type",metadata.resourceType);
    query=metadata.paperNumber==null?query.is("paper_number",null):query.eq("paper_number",metadata.paperNumber);
    query=metadata.variant==null?query.is("variant",null):query.eq("variant",metadata.variant);
    duplicateId=Number((await query.limit(1).maybeSingle()).data?.id)||null;
  }
  const detectionStatus=duplicateId?"duplicate":timedOut?"detection_timed_out":detected.status==="Ready"?"ready":detected.status==="Conflict"?"conflict":"needs_review";
  const payload={detected_metadata_json:{...metadata,subjectId,subjectName,level,fieldConfidence:detected.fieldConfidence,signals:detected.signals,normalizedPaperCode:detected.normalizedPaperCode},detection_confidence:detected.confidence,detection_status:detectionStatus,warnings_json:detected.warnings,conflicts_json:detected.conflicts,error_message:timedOut?detected.warnings[0]:null,error_step:timedOut?"detection_timeout":null,duplicate_of_resource_id:duplicateId,updated_at:new Date().toISOString()};
  const{data,error}=await supabaseAdmin.from("import_batch_files").update(payload).eq("id",fileRow.id).select("*").single();
  if(error)throw error;return data;
}

router.post("/bulk-import/batches/:batchId/files",requireAdmin,upload.single("file"),async(req,res)=>{
  const batchId=Number(req.params.batchId),file=req.file;
  if(!file){res.status(400).json({error:"Choose one PDF file."});return}
  const unique=`${Date.now()}-${randomUUID().slice(0,8)}-${safeName(file.originalname)}`;
  const path=`bulk-import/${batchId}/${unique}`;
  const hash=createHash("sha256").update(file.buffer).digest("hex");
  const{data:row,error:rowError}=await supabaseAdmin.from("import_batch_files").insert({import_batch_id:batchId,original_filename:file.originalname,file_size:file.size,mime_type:file.mimetype||"application/pdf",storage_bucket:"resources",storage_path:path,file_hash:hash,upload_status:"uploading",detection_status:"queued",import_status:"pending",processing_status:"pending"}).select("*").single();
  if(rowError||!row){res.status(422).json({error:rowError?.message??"Could not queue this file."});return}
  if(file.mimetype!=="application/pdf"&&!/\.pdf$/i.test(file.originalname)){
    const{data:unsupported}=await supabaseAdmin.from("import_batch_files").update({storage_path:null,upload_status:"uploaded",detection_status:"unsupported",warnings_json:["Unsupported file type. Only PDF resources can be imported."],updated_at:new Date().toISOString()}).eq("id",row.id).select("*").single();
    await refreshBatch(batchId);res.status(201).json(unsupported);return;
  }
  const{error:uploadError}=await supabaseAdmin.storage.from("resources").upload(path,file.buffer,{contentType:"application/pdf",upsert:false});
  if(uploadError){
    await supabaseAdmin.from("import_batch_files").update({upload_status:"upload_failed",detection_status:"detection_failed",error_step:"upload",error_message:uploadError.message,updated_at:new Date().toISOString()}).eq("id",row.id);
    await refreshBatch(batchId);res.status(422).json({fileId:row.id,error:`Upload failed for ${file.originalname}: ${uploadError.message}`});return;
  }
  await supabaseAdmin.from("import_batch_files").update({upload_status:"uploaded",detection_status:"detecting",updated_at:new Date().toISOString()}).eq("id",row.id);
  try{const detected=await detectPersistedFile({...row,storage_bucket:"resources",storage_path:path},file.buffer);await refreshBatch(batchId);res.status(201).json(detected)}
  catch(error){const message=error instanceof Error?error.message:"Metadata detection failed.";await supabaseAdmin.from("import_batch_files").update({detection_status:"detection_failed",error_step:"detection",error_message:message,updated_at:new Date().toISOString()}).eq("id",row.id);await refreshBatch(batchId);res.status(201).json({...row,upload_status:"uploaded",detection_status:"detection_failed",error_message:`Upload succeeded, but metadata detection failed: ${message}`})}
});

router.post("/bulk-import/files/:fileId/retry-detection",requireAdmin,async(req,res)=>{
  const fileId=Number(req.params.fileId);const{data:row,error}=await supabaseAdmin.from("import_batch_files").select("*").eq("id",fileId).single();
  if(error||!row){res.status(404).json({error:"Batch file not found."});return}
  await supabaseAdmin.from("import_batch_files").update({detection_status:"detecting",retry_count:Number(row.retry_count??0)+1,error_message:null,error_step:null}).eq("id",fileId);
  try{const result=await detectPersistedFile(row);await refreshBatch(Number(row.import_batch_id));res.json(result)}catch(cause){res.status(422).json({error:cause instanceof Error?cause.message:"Detection retry failed."})}
});

router.patch("/bulk-import/files/:fileId/metadata",requireAdmin,async(req,res)=>{
  const fileId=Number(req.params.fileId);const metadata=req.body?.metadata;
  if(!metadata||typeof metadata!=="object"){res.status(400).json({error:"Metadata is required."});return}
  const required=["subjectId","level","year","session","resourceType"];
  const missing=required.filter(key=>!metadata[key]);if(["PAST_PAPER","MARKING_SCHEME"].includes(metadata.resourceType))for(const key of ["paperNumber","variant"])if(!metadata[key])missing.push(key);
  const status=missing.length?"needs_review":"ready";
  const{data,error}=await supabaseAdmin.from("import_batch_files").update({detected_metadata_json:metadata,admin_overrides_json:metadata,detection_status:status,warnings_json:missing.map(key=>`Please provide ${key}.`),conflicts_json:[],updated_at:new Date().toISOString()}).eq("id",fileId).select("*").single();
  if(error){res.status(422).json({error:error.message});return}await refreshBatch(Number(data.import_batch_id));res.json(data);
});

router.post("/bulk-import/batches/:batchId/import",requireAdmin,async(req,res)=>{
  const batchId=Number(req.params.batchId),ids=Array.isArray(req.body?.fileIds)?req.body.fileIds.map(Number):[];
  const{data:files}=await supabaseAdmin.from("import_batch_files").select("*").eq("import_batch_id",batchId).in("id",ids).in("detection_status",["ready"]);
  const results:any[]=[];const input=files??[];let cursor=0;
  const importOne=async(row:any)=>{
    if(row.final_resource_id){results.push({fileId:row.id,status:"already_imported",resourceId:row.final_resource_id});return}
    try{
      const m=row.detected_metadata_json as any;
      const{data:resource,error}=await supabaseAdmin.from("resources").insert({subject_id:m.subjectId,level:m.level,title:String(row.original_filename).replace(/\.pdf$/i,""),resource_type:m.resourceType,year:m.year,session:m.session,paper_code:m.paperNumber?String(m.paperNumber):null,paper_number:m.paperNumber??null,variant:m.variant??null,bucket:row.storage_bucket,storage_path:row.storage_path,file_path:row.storage_path,file_url:row.storage_path,original_filename:row.original_filename,file_type:row.mime_type,file_size_bytes:row.file_size,file_hash:row.file_hash,import_batch_id:batchId,detection_confidence:row.detection_confidence,detected_metadata_json:m,detection_status:"ready",detection_warnings_json:row.warnings_json,normalized_paper_code:m.normalizedPaperCode,status:"uploaded",processing_status:"pending"}).select("id").single();
      if(error||!resource)throw error??new Error("Resource row creation failed.");
      await supabaseAdmin.from("import_batch_files").update({import_status:"imported",processing_status:"pending",final_resource_id:resource.id,updated_at:new Date().toISOString()}).eq("id",row.id);
      const{data:job,error:jobError}=await supabaseAdmin.from("processing_jobs").insert({resource_id:resource.id,status:"uploaded",current_step:"uploaded",progress_percent:10,retry_count:0,safe_logs:[{step:"uploaded",progress:10,at:new Date().toISOString()}]}).select("id").single();
      if(jobError){
        await supabaseAdmin.from("import_batch_files").update({processing_status:"failed",error_step:"processing_job_creation",error_message:jobError.message,updated_at:new Date().toISOString()}).eq("id",row.id);
        results.push({fileId:row.id,status:"imported_processing_failed",resourceId:resource.id,error:jobError.message});return;
      }
      await supabaseAdmin.from("import_batch_files").update({import_status:"imported",processing_status:"queued",final_resource_id:resource.id,processing_job_id:job?.id,error_message:null,error_step:null,updated_at:new Date().toISOString()}).eq("id",row.id);
      results.push({fileId:row.id,status:"imported",resourceId:resource.id,processingJobId:job?.id});
    }catch(error){const message=error instanceof Error?error.message:"Import failed.";await supabaseAdmin.from("import_batch_files").update({import_status:"import_failed",error_step:"resource_creation",error_message:message,retry_count:Number(row.retry_count??0)+1,updated_at:new Date().toISOString()}).eq("id",row.id);results.push({fileId:row.id,status:"failed",error:message})}
  };
  const workers=Array.from({length:Math.min(5,input.length)},async()=>{while(cursor<input.length){const row=input[cursor++];if(row.final_resource_id){results.push({fileId:row.id,status:"already_imported",resourceId:row.final_resource_id});continue}await importOne(row)}});
  await Promise.all(workers);
  const summary=await refreshBatch(batchId);await supabaseAdmin.from("admin_import_batches").update({status:summary.failed_count?"completed_with_errors":"processing"}).eq("id",batchId);
  res.json({results,summary,message:"Files imported. Processing is running in the background."});
});

router.post("/bulk-import/files/:fileId/skip",requireAdmin,async(req,res)=>{
  const{data,error}=await supabaseAdmin.from("import_batch_files").update({import_status:"skipped",updated_at:new Date().toISOString()}).eq("id",Number(req.params.fileId)).select("*").single();
  if(error){res.status(422).json({error:error.message});return}await refreshBatch(Number(data.import_batch_id));res.json(data);
});

export default router;
