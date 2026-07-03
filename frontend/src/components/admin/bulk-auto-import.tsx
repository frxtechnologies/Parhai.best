import { createBulkImportBatch, importBulkImportFiles, retryBulkImportDetection, updateBulkImportMetadata, uploadBulkImportFile } from "@/api/client";
import { expandBulkFiles, type BulkResourceType, type BulkSession } from "@/lib/cambridge-filename";
import { AlertTriangle, Archive, CheckCircle2, FileStack, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { useState } from "react";

type Subject={id:number;name:string;code:string;level:"O_LEVEL"|"A_LEVEL";board:string};
type Row={id:number;fileName:string;uploadStatus:string;detectionStatus:string;importStatus:string;processingStatus:string;metadata:any;confidence:number;warnings:string[];conflicts:string[];error:string|null;status:"Ready"|"Needs Review"|"Conflict"|"Duplicate"|"Unsupported"|"Failed";selected:boolean};
type Report={total:number;imported:number;duplicates:number;failed:number;needsReview:number};
const resourceTypes:BulkResourceType[]=["PAST_PAPER","MARKING_SCHEME","NOTES","WORKSHEET","SYLLABUS","EXAMINER_REPORT","GRADE_THRESHOLD","INSERT","SOURCE_FILE"];
const sessions:BulkSession[]=["MAY_JUNE","OCT_NOV","FEB_MAR"];
const label=(value:string)=>value.toLowerCase().replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase());

function fromServer(value:any):Row{
  const detection=String(value.detection_status??"detection_failed");
  const status:Row["status"]=detection==="ready"?"Ready":detection==="conflict"?"Conflict":detection==="duplicate"?"Duplicate":detection==="unsupported"?"Unsupported":value.upload_status==="upload_failed"||detection==="detection_failed"?"Failed":"Needs Review";
  return{id:Number(value.id),fileName:value.original_filename,uploadStatus:value.upload_status??"queued",detectionStatus:detection,importStatus:value.import_status??"pending",processingStatus:value.processing_status??"pending",metadata:value.detected_metadata_json??{},confidence:Number(value.detection_confidence??0),warnings:value.warnings_json??[],conflicts:value.conflicts_json??[],error:value.error_message??null,status,selected:status==="Ready"};
}
async function pool<T>(items:T[],limit:number,task:(item:T,index:number)=>Promise<void>){
  let cursor=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const index=cursor++;await task(items[index]!,index)}}));
}

export function BulkAutoImport({subjects,onImported}:{subjects:Subject[];onImported:()=>Promise<void>}){
  const[rows,setRows]=useState<Row[]>([]),[batchId,setBatchId]=useState<number|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[adminDetails,setAdminDetails]=useState(""),[report,setReport]=useState<Report|null>(null);
  const update=(id:number,patch:Partial<Row>)=>setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row));
  const editMetadata=(id:number,patch:Record<string,unknown>)=>setRows(current=>current.map(row=>{
    if(row.id!==id||row.status==="Duplicate")return row;const metadata={...row.metadata,...patch};
    const needsPaper=["PAST_PAPER","MARKING_SCHEME"].includes(String(metadata.resourceType));
    const ready=metadata.subjectId&&metadata.level&&metadata.year&&metadata.session&&metadata.resourceType&&(!needsPaper||(metadata.paperNumber&&metadata.variant));
    return{...row,metadata,status:ready?"Ready":"Needs Review",selected:Boolean(ready),warnings:ready?[]:row.warnings};
  }));

  async function prepare(selected:File[]){
    setBusy(true);setRows([]);setReport(null);setAdminDetails("");setMessage("Creating a resumable upload batch…");
    try{
      const files=await expandBulkFiles(selected);if(!files.length)throw new Error("Choose PDF files or a ZIP containing PDFs.");
      const batch=await createBulkImportBatch(files.length);setBatchId(Number(batch.id));
      const completed:Row[]=[];
      await pool(files,3,async(file,index)=>{
        setMessage(`Uploading and detecting ${index+1} of ${files.length}. Files already uploaded remain safe if you leave this page.`);
        try{completed.push(fromServer(await uploadBulkImportFile(Number(batch.id),file)))}
        catch(error){completed.push({id:-(index+1),fileName:file.name,uploadStatus:"upload_failed",detectionStatus:"detection_failed",importStatus:"pending",processingStatus:"pending",metadata:{},confidence:0,warnings:[],conflicts:[],error:error instanceof Error?error.message:"Upload failed",status:"Failed",selected:false})}
        setRows([...completed].sort((a,b)=>a.fileName.localeCompare(b.fileName)));
      });
      setMessage(`Batch ${batch.id} is saved. Review each file; one failure will not block the others.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Could not create the import batch.");setAdminDetails(String((error as any)?.adminDetails??""))}
    finally{setBusy(false)}
  }
  async function retry(row:Row){
    if(row.id<1)return;update(row.id,{detectionStatus:"detecting",error:null});try{const result=fromServer(await retryBulkImportDetection(row.id));update(row.id,result)}catch(error){update(row.id,{status:"Failed",error:error instanceof Error?error.message:"Detection retry failed."})}
  }
  async function confirm(){
    if(!batchId)return;const ready=rows.filter(row=>row.status==="Ready"&&row.selected&&row.id>0);if(!ready.length){setMessage("Select at least one ready file.");return}
    setBusy(true);setMessage("Creating resources and background processing jobs…");
    let failed=0,imported=0;
    try{
      for(const row of ready){try{await updateBulkImportMetadata(row.id,row.metadata)}catch(error){failed++;update(row.id,{status:"Failed",error:error instanceof Error?error.message:"Metadata update failed."})}}
      const response=await importBulkImportFiles(batchId,ready.map(row=>row.id));
      for(const result of response.results as any[]){if(["imported","already_imported","imported_processing_failed"].includes(result.status)){imported++;update(result.fileId,{importStatus:"imported",processingStatus:result.status==="imported_processing_failed"?"failed":"queued",selected:false,error:result.error??null})}else{failed++;update(result.fileId,{importStatus:"import_failed",status:"Failed",error:result.error})}}
      setMessage("Files imported. Processing is running in the background. You can leave this page and monitor Admin > Processing Jobs.");
      setReport({total:rows.length,imported,duplicates:rows.filter(r=>r.status==="Duplicate").length,failed,needsReview:rows.filter(r=>["Needs Review","Conflict"].includes(r.status)).length});
      if(imported)await onImported();
    }catch(error){setMessage(error instanceof Error?error.message:"Import request failed. Uploaded files remain saved in this batch.")}
    finally{setBusy(false)}
  }
  const summary={uploaded:rows.filter(r=>r.uploadStatus==="uploaded").length,ready:rows.filter(r=>r.status==="Ready").length,review:rows.filter(r=>r.status==="Needs Review").length,conflicts:rows.filter(r=>r.status==="Conflict").length,duplicates:rows.filter(r=>r.status==="Duplicate").length,failed:rows.filter(r=>r.status==="Failed").length,imported:rows.filter(r=>r.importStatus==="imported").length,processing:rows.filter(r=>["queued","processing"].includes(r.processingStatus)).length};
  return <section className="rounded-2xl border bg-white p-6 shadow-sm">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><FileStack className="h-5 w-5"/></span><div><h2 className="text-xl font-bold text-[#0B1F3A]">Resumable Bulk Import</h2><p className="mt-1 text-sm text-slate-500">Each PDF is uploaded, detected, imported, and processed independently.</p></div></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-sm font-semibold text-white"><UploadCloud className="h-4 w-4"/>Choose PDFs or ZIP<input type="file" multiple accept=".pdf,.zip,application/pdf,application/zip" className="sr-only" disabled={busy} onChange={event=>{void prepare(Array.from(event.target.files??[]));event.target.value=""}}/></label></div>
    {message&&<p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</p>}
    {adminDetails&&<details className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs"><summary className="cursor-pointer font-semibold text-amber-800">Admin diagnostic details</summary><pre className="mt-2 whitespace-pre-wrap text-amber-900">{adminDetails}</pre></details>}
    {!!rows.length&&<><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">{Object.entries(summary).map(([key,value])=><div key={key} className="rounded-xl border p-3"><b className="text-xl">{value}</b><p className="text-xs capitalize text-slate-500">{key}</p></div>)}</div>
    <div className="sticky top-2 z-20 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-white/95 p-3 shadow-lg backdrop-blur"><div><p className="font-semibold text-[#0B1F3A]">{rows.filter(r=>r.status==="Ready"&&r.selected).length} ready files selected</p><p className="text-xs text-slate-500">Upload alone does not add files to the paper library. Import them to create resources and AI processing jobs.</p></div><div className="flex gap-2"><button onClick={()=>setRows(current=>current.map(r=>r.status==="Ready"&&r.importStatus!=="imported"?{...r,selected:true}:r))} className="rounded-lg border px-3 py-2 text-sm">Select all ready</button><button disabled={busy||!rows.some(r=>r.status==="Ready"&&r.selected)} onClick={()=>void confirm()} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}Import {rows.filter(r=>r.status==="Ready"&&r.selected).length} ready files</button></div></div>
    <div className="mt-5 overflow-x-auto rounded-xl border"><table className="min-w-[1550px] w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["Select","File","Upload","Subject","Level","Code","Year / Session","Component","Variant","Type","Confidence","Status / Warning","Action"].map(x=><th key={x} className="px-3 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{rows.map(row=><tr key={row.id} className={row.status==="Failed"?"bg-red-50/40":row.status!=="Ready"?"bg-amber-50/30":""}>
      <td className="px-3"><input type="checkbox" checked={row.selected} disabled={row.status!=="Ready"||row.importStatus==="imported"} onChange={e=>update(row.id,{selected:e.target.checked})}/></td><td className="max-w-52 truncate px-3 font-semibold" title={row.fileName}>{row.fileName}</td><td className="px-3">{label(row.uploadStatus)}</td>
      <td className="px-2"><select className="field-input min-w-44 py-2" value={row.metadata.subjectId??""} disabled={row.status==="Duplicate"} onChange={e=>{const s=subjects.find(x=>x.id===Number(e.target.value));if(s)editMetadata(row.id,{subjectId:s.id,subjectName:s.name,syllabusCode:s.code.padStart(4,"0"),level:s.level})}}><option value="">Choose subject</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
      <td className="px-2"><select className="field-input w-36 py-2" value={row.metadata.level??"O_LEVEL"} onChange={e=>editMetadata(row.id,{level:e.target.value})}><option value="O_LEVEL">O Level</option><option value="A_LEVEL">AS / A Level</option></select></td><td className="px-2"><input className="field-input w-24 py-2" value={row.metadata.syllabusCode??""} onChange={e=>editMetadata(row.id,{syllabusCode:e.target.value})}/></td>
      <td className="px-2"><div className="flex gap-1"><input type="number" className="field-input w-24 py-2" value={row.metadata.year??""} onChange={e=>editMetadata(row.id,{year:Number(e.target.value)||null})}/><select className="field-input w-32 py-2" value={row.metadata.session??""} onChange={e=>editMetadata(row.id,{session:e.target.value})}><option value="">Session</option>{sessions.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></div></td>
      <td className="px-2"><input type="number" className="field-input w-20 py-2" value={row.metadata.paperNumber??""} onChange={e=>editMetadata(row.id,{paperNumber:Number(e.target.value)||null})}/></td><td className="px-2"><input type="number" className="field-input w-20 py-2" value={row.metadata.variant??""} onChange={e=>editMetadata(row.id,{variant:Number(e.target.value)||null})}/></td>
      <td className="px-2"><select className="field-input w-40 py-2" value={row.metadata.resourceType??""} onChange={e=>editMetadata(row.id,{resourceType:e.target.value})}><option value="">Choose</option>{resourceTypes.map(t=><option key={t} value={t}>{label(t)}</option>)}</select></td><td className="px-3 font-semibold">{row.confidence}%</td>
      <td className="max-w-72 px-3"><b className={row.status==="Ready"?"text-emerald-700":row.status==="Failed"?"text-red-700":"text-amber-700"}>{row.importStatus==="imported"?"Imported · Processing queued":row.status}</b>{[row.error,...row.conflicts,...row.warnings].filter(Boolean).map((x,i)=><p key={i} className="mt-1 text-[11px]">{x}</p>)}<details className="mt-1"><summary className="cursor-pointer text-teal-700">Detection details</summary><pre className="mt-1 max-w-64 whitespace-pre-wrap rounded bg-white p-2">{JSON.stringify({metadata:row.metadata,confidence:row.confidence},null,2)}</pre></details></td>
      <td className="px-3">{["Failed","Needs Review","Conflict"].includes(row.status)&&row.id>0&&<button onClick={()=>void retry(row)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><RefreshCw className="h-3 w-3"/>Retry detection</button>}{row.status==="Duplicate"&&<span className="text-slate-500">Skipped safely</span>}</td>
    </tr>)}</tbody></table></div>
    <div className="mt-4 flex justify-end"><button disabled={busy||!rows.some(r=>r.status==="Ready"&&r.selected)} onClick={()=>void confirm()} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}Import selected</button></div></>}
    {report&&<div className="mt-5 grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-5">{Object.entries(report).map(([key,value])=><div key={key}><p className="text-2xl font-bold">{value}</p><p className="text-xs capitalize text-slate-500">{key}</p></div>)}</div>}
    {!rows.length&&!busy&&<div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm text-slate-400"><Archive className="h-4 w-4"/>Uploads are persisted before metadata review.</div>}
    {rows.some(r=>r.status==="Failed")&&<p className="mt-4 flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4"/>Failed files do not block successful files. Uploaded files remain available for retry.</p>}
  </section>
}
