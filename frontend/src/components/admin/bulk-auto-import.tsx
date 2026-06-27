import { requestResourceProcessing } from "@/api/client";
import { detectCambridgeFilename, expandBulkFiles, sha256File, type BulkResourceType, type BulkSession } from "@/lib/cambridge-filename";
import { requireSupabase } from "@/lib/supabase";
import { Archive, CheckCircle2, FileStack, Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";

type Subject = { id: number; name: string; code: string; level: "O_LEVEL" | "A_LEVEL"; board: string };
type ImportStatus = "Ready" | "Needs Review" | "Duplicate";
type ImportRow = {
  id: string; file: File; fileName: string; fileHash: string; subjectCode: string; subjectId: number | null;
  subjectName: string; level: "O_LEVEL" | "A_LEVEL"; resourceType: BulkResourceType | null;
  year: number | null; session: BulkSession | null; paperNumber: number | null; variant: number | null;
  confidence: number; status: ImportStatus; warning: string | null;
};
type Report = { total: number; imported: number; duplicates: number; failed: number; needsReview: number };

const resourceTypes: BulkResourceType[] = ["PAST_PAPER", "MARKING_SCHEME", "GRADE_THRESHOLD", "EXAMINER_REPORT", "INSERT", "SOURCE_FILE", "SYLLABUS"];
const sessions: BulkSession[] = ["MAY_JUNE", "OCT_NOV", "FEB_MAR"];
const label = (value: string) => value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function rowStatus(row: ImportRow): Pick<ImportRow, "status" | "warning" | "confidence"> {
  const needsPaper = row.resourceType === "PAST_PAPER" || row.resourceType === "MARKING_SCHEME";
  if (!row.subjectId) return { status: "Needs Review", warning: "Unknown subject code. Choose a subject.", confidence: Math.min(row.confidence, 55) };
  if (!row.resourceType || !row.year || !row.session) return { status: "Needs Review", warning: "Complete all required detected fields.", confidence: Math.min(row.confidence, 60) };
  if (needsPaper && (!row.paperNumber || !row.variant)) return { status: "Needs Review", warning: "Paper and variant are required.", confidence: Math.min(row.confidence, 75) };
  return { status: "Ready", warning: null, confidence: Math.max(row.confidence, 90) };
}

export function BulkAutoImport({ subjects, onImported }: { subjects: Subject[]; onImported: () => Promise<void> }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  async function prepare(selected: File[]) {
    setBusy(true); setMessage("Reading files and calculating hashes…"); setReport(null);
    try {
      const files = await expandBulkFiles(selected);
      if (!files.length) throw new Error("Choose PDF files or a ZIP containing PDFs.");
      const client = requireSupabase();
      const { data: mappings, error: mappingError } = await client.from("subject_code_map").select("subject_code,subject_id,subjects(name,code,level,board)");
      if (mappingError) throw mappingError;
      const hashes = await Promise.all(files.map(sha256File));
      const existingHashes = new Set<string>();
      for (let offset = 0; offset < hashes.length; offset += 100) {
        const { data, error } = await client.from("resources").select("file_hash").in("file_hash", hashes.slice(offset, offset + 100));
        if (error) throw error;
        data?.forEach((item) => item.file_hash && existingHashes.add(item.file_hash));
      }
      const mapping = new Map((mappings ?? []).map((item) => [item.subject_code, { id: Number(item.subject_id), ...(Array.isArray(item.subjects) ? item.subjects[0] : item.subjects) }]));
      setRows(files.map((file, index) => {
        const detected = detectCambridgeFilename(file.name);
        const found = mapping.get(detected.subjectCode);
        const duplicate = existingHashes.has(hashes[index]!);
        const base: ImportRow = {
          id: `${Date.now()}-${index}`, file, fileName: detected.fileName, fileHash: hashes[index]!,
          subjectCode: detected.subjectCode, subjectId: found?.id ?? null, subjectName: found?.name ?? "",
          level: found?.level ?? "O_LEVEL", resourceType: detected.resourceType, year: detected.year, session: detected.session,
          paperNumber: detected.paperNumber, variant: detected.variant, confidence: detected.confidence,
          status: duplicate ? "Duplicate" : "Needs Review", warning: duplicate ? "Duplicate file hash already exists." : detected.warning,
        };
        return duplicate ? base : { ...base, ...rowStatus(base) };
      }));
      setMessage(`${files.length} PDF${files.length === 1 ? "" : "s"} ready for review.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not prepare files."); }
    finally { setBusy(false); }
  }

  function edit(id: string, patch: Partial<ImportRow>) {
    setRows((current) => current.map((row) => {
      if (row.id !== id || row.status === "Duplicate") return row;
      let next = { ...row, ...patch };
      if (patch.subjectId !== undefined) {
        const subject = subjects.find((item) => item.id === patch.subjectId);
        if (subject) next = { ...next, subjectName: subject.name, subjectCode: subject.code.padStart(4, "0"), level: subject.level };
      }
      return { ...next, ...rowStatus(next) };
    }));
  }

  async function confirmImport() {
    const ready = rows.filter((row) => row.status === "Ready");
    if (!ready.length) { setMessage("Resolve at least one Needs Review row before importing."); return; }
    setBusy(true); setMessage("Importing files to Supabase…"); setReport(null);
    const client = requireSupabase();
    const duplicateInitial = rows.filter((row) => row.status === "Duplicate").length;
    const needsReview = rows.filter((row) => row.status === "Needs Review").length;
    let imported = 0; let duplicates = duplicateInitial; let failed = 0;
    const details: Array<{ fileName: string; status: string; error?: string }> = [];
    const { data: batch, error: batchError } = await client.from("admin_import_batches").insert({
      status: "importing", total_files: rows.length, duplicate_count: duplicateInitial, needs_review_count: needsReview,
    }).select("id").single();
    if (batchError || !batch) { setBusy(false); setMessage(batchError?.message ?? "Could not create import batch."); return; }
    const { data: sessionData } = await client.auth.getSession();
    for (const row of ready) {
      const storagePath = `resources/${row.level}/${row.subjectCode}/${row.year}/${row.session}/${row.resourceType!.toLowerCase()}/${row.fileName}`;
      try {
        let examQuery = client.from("resources").select("id").eq("subject_id", row.subjectId!).eq("year", row.year!).eq("session", row.session!).eq("resource_type", row.resourceType!);
        examQuery = row.paperNumber == null ? examQuery.is("paper_number", null) : examQuery.eq("paper_number", row.paperNumber);
        examQuery = row.variant == null ? examQuery.is("variant", null) : examQuery.eq("variant", row.variant);
        const { data: existingExam, error: examError } = await examQuery.limit(1).maybeSingle();
        if (examError) throw examError;
        if (existingExam) { duplicates++; details.push({ fileName: row.fileName, status: "duplicate", error: "Duplicate exam key already exists." }); continue; }
        const { error: uploadError } = await client.storage.from("resources").upload(storagePath, row.file, { contentType: "application/pdf", upsert: false });
        if (uploadError) throw uploadError;
        const { data: resource, error: insertError } = await client.from("resources").insert({
          subject_id: row.subjectId, level: row.level, title: row.fileName.replace(/\.pdf$/i, ""), resource_type: row.resourceType,
          year: row.year, session: row.session, paper_code: row.paperNumber?.toString() ?? null, paper_number: row.paperNumber,
          variant: row.variant, bucket: "resources", storage_path: storagePath, file_path: storagePath, file_url: storagePath,
          original_filename: row.fileName, file_type: "application/pdf", file_size_bytes: row.file.size,
          file_hash: row.fileHash, import_batch_id: batch.id, detection_confidence: row.confidence,
          status: "uploaded", processing_status: "pending",
        }).select("id").single();
        if (insertError || !resource) {
          await client.storage.from("resources").remove([storagePath]);
          if (insertError?.code === "23505") { duplicates++; details.push({ fileName: row.fileName, status: "duplicate", error: insertError.message }); continue; }
          throw insertError ?? new Error("Metadata insert failed.");
        }
        imported++; details.push({ fileName: row.fileName, status: "imported" });
        void requestResourceProcessing(Number(resource.id), sessionData.session?.access_token ?? "").catch(() => undefined);
      } catch (error) { failed++; details.push({ fileName: row.fileName, status: "failed", error: error instanceof Error ? error.message : "Import failed" }); }
    }
    const finalReport = { total: rows.length, imported, duplicates, failed, needsReview };
    await client.from("admin_import_batches").update({
      status: failed ? "completed_with_errors" : "completed", imported_count: imported, duplicate_count: duplicates,
      failed_count: failed, needs_review_count: needsReview, report: { files: details }, completed_at: new Date().toISOString(),
    }).eq("id", batch.id);
    setReport(finalReport); setBusy(false);
    setMessage(failed ? "Import completed with errors. Review the report below." : "Bulk import completed.");
    if (imported) await onImported();
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><FileStack className="h-5 w-5" /></span><div><h2 className="text-xl font-bold text-[#0B1F3A]">Bulk Auto Import</h2><p className="mt-1 text-sm text-slate-500">Upload multiple Cambridge PDFs or one ZIP. Review every detected field before saving.</p></div></div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-sm font-semibold text-white">
          <UploadCloud className="h-4 w-4" /> Choose PDFs or ZIP
          <input type="file" multiple accept=".pdf,.zip,application/pdf,application/zip" className="sr-only" disabled={busy} onChange={(event) => { void prepare(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        </label>
      </div>
      {message && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</p>}
      {rows.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border">
          <table className="min-w-[1450px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{["File name","Type","Subject code","Subject","Level","Year","Session","Paper","Variant","Confidence","Status / warning"].map((head) => <th key={head} className="px-3 py-3 font-semibold">{head}</th>)}</tr></thead>
            <tbody className="divide-y">{rows.map((row) => <tr key={row.id} className={row.status === "Needs Review" ? "bg-amber-50/40" : row.status === "Duplicate" ? "bg-slate-50 text-slate-400" : ""}>
              <td className="max-w-52 truncate px-3 py-2 font-medium" title={row.fileName}>{row.fileName}</td>
              <td className="px-2 py-2"><select className="field-input min-w-40 py-2" disabled={row.status === "Duplicate"} value={row.resourceType ?? ""} onChange={(e) => edit(row.id, { resourceType: e.target.value as BulkResourceType })}><option value="">Choose</option>{resourceTypes.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></td>
              <td className="px-2 py-2"><input className="field-input w-24 py-2" disabled={row.status === "Duplicate"} value={row.subjectCode} onChange={(e) => edit(row.id, { subjectCode: e.target.value })} /></td>
              <td className="px-2 py-2"><select className="field-input min-w-44 py-2" disabled={row.status === "Duplicate"} value={row.subjectId ?? ""} onChange={(e) => edit(row.id, { subjectId: Number(e.target.value) || null })}><option value="">Needs review</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></td>
              <td className="px-2 py-2"><select className="field-input w-28 py-2" disabled={row.status === "Duplicate"} value={row.level} onChange={(e) => edit(row.id, { level: e.target.value as ImportRow["level"] })}><option value="O_LEVEL">O Level</option><option value="A_LEVEL">A Level</option></select></td>
              <td className="px-2 py-2"><input type="number" className="field-input w-24 py-2" disabled={row.status === "Duplicate"} value={row.year ?? ""} onChange={(e) => edit(row.id, { year: Number(e.target.value) || null })} /></td>
              <td className="px-2 py-2"><select className="field-input min-w-32 py-2" disabled={row.status === "Duplicate"} value={row.session ?? ""} onChange={(e) => edit(row.id, { session: e.target.value as BulkSession })}><option value="">Choose</option>{sessions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></td>
              <td className="px-2 py-2"><input type="number" className="field-input w-20 py-2" disabled={row.status === "Duplicate"} value={row.paperNumber ?? ""} onChange={(e) => edit(row.id, { paperNumber: Number(e.target.value) || null })} /></td>
              <td className="px-2 py-2"><input type="number" className="field-input w-20 py-2" disabled={row.status === "Duplicate"} value={row.variant ?? ""} onChange={(e) => edit(row.id, { variant: Number(e.target.value) || null })} /></td>
              <td className="px-3 py-2"><span className="font-semibold">{row.confidence}%</span></td>
              <td className="max-w-64 px-3 py-2"><span className={`font-semibold ${row.status === "Ready" ? "text-emerald-700" : row.status === "Duplicate" ? "text-slate-500" : "text-amber-700"}`}>{row.status}</span>{row.warning && <p className="mt-1 text-[11px]">{row.warning}</p>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && <div className="mt-4 flex justify-end"><button disabled={busy || !rows.some((row) => row.status === "Ready")} onClick={confirmImport} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm Import</button></div>}
      {report && <div className="mt-5 grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-5">{Object.entries(report).map(([key, value]) => <div key={key}><p className="text-2xl font-bold text-[#0B1F3A]">{value}</p><p className="text-xs capitalize text-slate-500">{key.replace(/([A-Z])/g, " $1")}</p></div>)}</div>}
      {!rows.length && <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm text-slate-400"><Archive className="h-4 w-4" /> Cambridge filenames are detected locally before upload.</div>}
    </section>
  );
}
