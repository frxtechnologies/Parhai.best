import { AppLayout } from "@/components/layout/app-layout";
import { isAdminEmail } from "@/config/admin";
import { useAuth } from "@/context/auth-context";
import { API_BASE_URL, useDirectPdfUpload, useListNotes, useListPapers, useListSubjects } from "@/api/client";
import { requireSupabase } from "@/lib/supabase";
import type { DirectPdfUploadInput } from "@/api/types";
import { BookOpen, CheckCircle2, FileText, ShieldCheck, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Redirect } from "wouter";

const sessions: DirectPdfUploadInput["session"][] = ["MAY_JUNE", "OCT_NOV", "FEB_MAR"];
type ProcessingPaper = { id: number; title: string; year: number; session: string; paper_number: number; variant: number | null; ingestion_status: string; processing_error: string | null; raw_text: string | null; questions: Array<{ count: number }> };

export default function Admin() {
  const { user, isLoading } = useAuth();
  const { data: subjects = [] } = useListSubjects();
  const { data: papers = [] } = useListPapers({});
  const { data: notes = [] } = useListNotes({});
  const upload = useDirectPdfUpload();
  const [message, setMessage] = useState("");
  const [processingPapers, setProcessingPapers] = useState<ProcessingPaper[]>([]);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    resourceType: "PAPER" as DirectPdfUploadInput["resourceType"],
    level: "O_LEVEL" as DirectPdfUploadInput["level"],
    subjectId: "",
    title: "",
    topic: "",
    year: "2024",
    session: "MAY_JUNE" as DirectPdfUploadInput["session"],
    paperNumber: "1",
    variant: "",
    relatedPaperId: "",
  });

  const levelSubjects = useMemo(() => subjects.filter((subject) => subject.level === form.level), [form.level, subjects]);
  const selectedSubject = levelSubjects.find((subject) => subject.id === Number(form.subjectId));

  async function loadProcessingPapers() {
    const { data } = await requireSupabase().from("papers").select("id,title,year,session,paper_number,variant,ingestion_status,processing_error,raw_text,questions(count)").eq("source_type", "QUESTION_PAPER").order("created_at", { ascending: false });
    setProcessingPapers((data ?? []) as ProcessingPaper[]);
  }
  useEffect(() => { void loadProcessingPapers(); }, []);

  async function processPaper(paperId: number) {
    setProcessingId(paperId); setMessage("");
    try {
      const client = requireSupabase();
      const { data } = await client.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/papers/${paperId}/process`, { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token}` } });
      const body = await response.json() as { extracted?: number; aiClassified?: number; classificationWarning?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Paper processing failed.");
      setMessage(`Processing complete: ${body.extracted ?? 0} real questions extracted and ${body.aiClassified ?? 0} classified by the active AI provider.${body.classificationWarning ? ` Classification warning: ${body.classificationWarning}` : ""}`);
      await loadProcessingPapers();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Paper processing failed."); }
    finally { setProcessingId(null); }
  }

  if (isLoading) return <AppLayout><></></AppLayout>;
  if (!isAdminEmail(user?.email)) return <Redirect to="/dashboard" />;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setMessage("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!selectedSubject || !file || !form.title.trim()) return;

    const result = await upload.mutateAsync({
      resourceType: form.resourceType,
      level: form.level,
      subjectId: selectedSubject.id,
      subjectName: selectedSubject.name,
      subjectCode: selectedSubject.code,
      title: form.title.trim(),
      topic: form.topic,
      year: Number(form.year),
      session: form.session,
      paperNumber: Number(form.paperNumber),
      variant: form.variant ? Number(form.variant) : null,
      relatedPaperId: form.relatedPaperId ? Number(form.relatedPaperId) : null,
      file,
    });

    setMessage(`Upload successful. Saved to ${result.bucket}/${result.path}`);
    setFile(null);
    setForm((current) => ({ ...current, title: "", topic: "", variant: "", relatedPaperId: "" }));
  }

  const needsExamFields = form.resourceType !== "NOTE";
  const needsRelatedPaper = form.resourceType === "MARKING_SCHEME";
  const canSubmit = Boolean(
    file && selectedSubject && form.title.trim() && (!needsRelatedPaper || form.relatedPaperId)
  );

  return (
    <AppLayout>
      <div className="space-y-8">
        <header className="flex items-center gap-3">
          <div className="rounded-xl bg-[#0B1F3A]/10 p-3"><ShieldCheck className="h-7 w-7 text-[#0B1F3A]" /></div>
          <div>
            <h1 className="text-3xl font-bold text-[#0B1F3A]">Admin uploads</h1>
            <p className="text-gray-500">Save PDFs and metadata directly to Supabase. Automation can be added later.</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-4">
          <Stat label="Subjects" value={subjects.length} icon={BookOpen} />
          <Stat label="Papers" value={papers.length} icon={FileText} />
          <Stat label="Notes" value={notes.length} icon={FileText} />
        </div>

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <form onSubmit={handleSubmit} className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#0B1F3A]">Direct PDF upload</h2>
                <p className="mt-1 text-sm text-gray-500">No webhook or n8n is required. The signed-in admin uploads directly to Supabase Storage.</p>
              </div>
              <div className="rounded-xl bg-[#14B8A6]/10 p-3 text-[#14B8A6]"><UploadCloud className="h-6 w-6" /></div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Resource type">
                <select value={form.resourceType} onChange={(e) => update("resourceType", e.target.value as DirectPdfUploadInput["resourceType"])} className="field-input">
                  <option value="PAPER">Question paper</option>
                  <option value="MARKING_SCHEME">Marking scheme</option>
                  <option value="EXAMINER_REPORT">Examiner report</option>
                  <option value="NOTE">Study note</option>
                </select>
              </Field>
              <Field label="Level">
                <select value={form.level} onChange={(e) => update("level", e.target.value as DirectPdfUploadInput["level"])} className="field-input">
                  <option value="O_LEVEL">O Level</option><option value="A_LEVEL">A Level</option>
                </select>
              </Field>
              <Field label="Subject">
                <select required value={form.subjectId} onChange={(e) => update("subjectId", e.target.value)} className="field-input">
                  <option value="">Select subject</option>
                  {levelSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} ({subject.code})</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input required value={form.title} onChange={(e) => update("title", e.target.value)} className="field-input" placeholder="Resource title" />
              </Field>

              {needsRelatedPaper && (
                <Field label="Related question paper">
                  <select required value={form.relatedPaperId} onChange={(e) => update("relatedPaperId", e.target.value)} className="field-input">
                    <option value="">Select uploaded paper</option>
                    {papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}
                  </select>
                </Field>
              )}

              {form.resourceType === "NOTE" ? (
                <Field label="Topic"><input value={form.topic} onChange={(e) => update("topic", e.target.value)} className="field-input" placeholder="General" /></Field>
              ) : (
                <>
                  <Field label="Year"><input required type="number" min="2000" max="2100" value={form.year} onChange={(e) => update("year", e.target.value)} className="field-input" /></Field>
                  <Field label="Session">
                    <select value={form.session} onChange={(e) => update("session", e.target.value as DirectPdfUploadInput["session"])} className="field-input">
                      {sessions.map((session) => <option key={session}>{session}</option>)}
                    </select>
                  </Field>
                  <Field label="Paper number"><input required type="number" min="1" value={form.paperNumber} onChange={(e) => update("paperNumber", e.target.value)} className="field-input" /></Field>
                  <Field label="Variant"><input type="number" min="1" value={form.variant} onChange={(e) => update("variant", e.target.value)} className="field-input" placeholder="Optional" /></Field>
                </>
              )}

              <Field label="PDF file"><input required type="file" accept="application/pdf,.pdf" onChange={pickFile} className="field-input" /></Field>
            </div>

            <div className="mt-6 space-y-3">
              <button type="submit" disabled={upload.isPending || !canSubmit} className="rounded-xl bg-[#0B1F3A] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {upload.isPending ? "Uploading..." : "Upload directly to Supabase"}
              </button>
              {message && <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>}
              {upload.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{upload.error.message}</p>}
            </div>
          </form>

          <aside className="rounded-2xl bg-[#0B1F3A] p-6 text-white">
            <h2 className="text-xl font-bold">Basic upload flow</h2>
            <div className="mt-5 space-y-4 text-sm text-white/75">
              <p>1. Select the resource and PDF.</p><p>2. Upload directly to its private Storage bucket.</p>
              <p>3. Save metadata in the matching database table.</p><p>4. Show a success message.</p>
              <p className="border-t border-white/15 pt-4">Optional extraction, OCR, embeddings, and n8n automation can run later.</p>
            </div>
          </aside>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-6"><h2 className="text-xl font-bold text-[#0B1F3A]">Process uploaded papers</h2><p className="mt-1 text-sm text-gray-500">Extract real PDF text, split questions, classify topics with the active AI provider, and save linked question rows.</p></div>
          <div className="divide-y">{processingPapers.map((paper) => { const count = paper.questions?.[0]?.count ?? 0; return <div key={paper.id} data-paper-id={paper.id} className="grid gap-3 p-5 md:grid-cols-[1fr_160px_150px] md:items-center"><div><p className="font-semibold text-[#0B1F3A]">{paper.title}</p><p className="text-sm text-gray-500">{paper.year} {paper.session.replace("_", " ")} · P{paper.paper_number}{paper.variant ? ` v${paper.variant}` : ""}</p>{paper.processing_error&&<p className="mt-1 text-xs text-red-600">{paper.processing_error}</p>}</div><div className="text-sm"><p>{count} questions</p><p className="text-gray-500">{paper.raw_text ? "Text extracted" : "No extracted text"}</p></div><button data-testid={`process-paper-${paper.id}`} onClick={()=>processPaper(paper.id)} disabled={processingId===paper.id} className="rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{processingId===paper.id ? "Processing…" : count ? "Reprocess Paper" : "Process Paper"}</button></div>})}{!processingPapers.length&&<p className="p-8 text-center text-sm text-gray-500">No question papers uploaded.</p>}</div>
        </section>
      </div>
    </AppLayout>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="space-y-2 text-sm font-semibold text-[#0B1F3A]"><span>{label}</span>{children}</label>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return <div className="rounded-2xl bg-cyan-50 p-5"><Icon className="mb-3 h-5 w-5 text-[#0B1F3A]" /><div className="text-3xl font-bold text-[#0B1F3A]">{value}</div><div className="text-sm text-gray-500">{label}</div></div>;
}
