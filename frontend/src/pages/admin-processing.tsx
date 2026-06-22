import { API_BASE_URL, requestResourceProcessing } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { isAdminEmail } from "@/config/admin";
import { useAuth } from "@/context/auth-context";
import { requireSupabase } from "@/lib/supabase";
import { Eye, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Redirect } from "wouter";

type Job = { id: number; status: string; error_message: string | null; retry_count: number; updated_at: string };
type Resource = { id: number; title: string; resource_type: string; processing_status: string; processing_error: string | null; subjects: { name: string } | null; processing_jobs: Job[]; question_index: Array<{ count: number }> };
type IndexedQuestion = { id: number; question_number: string; topic: string; subtopic: string | null; difficulty: string; marks: number | null; question_text: string; answer_text: string | null };

export default function AdminProcessing() {
  const { user, isLoading } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [questions, setQuestions] = useState<Record<number, IndexedQuestion[]>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const { data, error } = await requireSupabase().from("resources")
      .select("id,title,resource_type,processing_status,processing_error,subjects(name),processing_jobs(id,status,error_message,retry_count,updated_at),question_index(count)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as unknown as Resource[];
    rows.forEach((row) => row.processing_jobs.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setResources(rows);
  }

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, []);
  if (isLoading) return <AppLayout><div /></AppLayout>;
  if (!isAdminEmail(user?.email)) return <Redirect to="/dashboard" />;

  async function authHeader() {
    const { data } = await requireSupabase().auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }

  async function retry(resourceId: number) {
    setBusy(resourceId); setMessage("");
    const headers = await authHeader();
    const response = await requestResourceProcessing(resourceId, headers.Authorization.replace("Bearer ", ""));
    const body = (response.status === 202 ? {} : await response.json()) as { indexedQuestions?: number; linkedAnswers?: number; chunks?: number; error?: string };
    setMessage(response.status === 202 ? "Processing queued in the background." : response.ok ? `Completed: ${body.chunks ?? 0} chunks, ${body.indexedQuestions ?? 0} questions, ${body.linkedAnswers ?? 0} linked answers.` : body.error ?? "Processing failed.");
    setBusy(null); await load();
  }

  async function viewQuestions(resourceId: number) {
    if (questions[resourceId]) { setQuestions((current) => { const next = { ...current }; delete next[resourceId]; return next; }); return; }
    const response = await fetch(`${API_BASE_URL}/api/resources/${resourceId}/questions`, { headers: await authHeader() });
    const body = await response.json() as { questions?: IndexedQuestion[]; error?: string };
    if (!response.ok) { setMessage(body.error ?? "Could not load extracted questions."); return; }
    setQuestions((current) => ({ ...current, [resourceId]: body.questions ?? [] }));
  }

  return <AppLayout><div className="space-y-6"><header><h1 className="text-3xl font-bold text-[#0B1F3A]">Automatic processing jobs</h1><p className="text-gray-500">Extraction, question indexing, topic tagging, embeddings, and marking-scheme links.</p></header>{message&&<div className="rounded-xl border bg-cyan-50 p-4 text-sm text-[#0B1F3A]">{message}</div>}<section className="divide-y overflow-hidden rounded-2xl border bg-white">{resources.map((resource) => { const job = resource.processing_jobs[0]; const open = questions[resource.id]; return <article key={resource.id} className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex flex-wrap items-center gap-2"><b className="text-[#0B1F3A]">{resource.title}</b><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{resource.resource_type}</span><span className={`rounded-full px-2 py-1 text-xs ${job?.status==="completed"?"bg-emerald-100 text-emerald-700":job?.status==="failed"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>{job?.status ?? resource.processing_status}</span></div><p className="mt-1 text-sm text-gray-500">{resource.subjects?.name} · {resource.question_index[0]?.count ?? 0} indexed questions · retries {job?.retry_count ?? 0}</p>{(job?.error_message||resource.processing_error)&&<p className="mt-2 text-xs text-red-600">{job?.error_message||resource.processing_error}</p>}</div><div className="flex gap-2"><button onClick={()=>viewQuestions(resource.id)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Eye className="h-4 w-4"/>View questions</button><button disabled={busy===resource.id} onClick={()=>retry(resource.id)} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] px-3 py-2 text-sm text-white disabled:opacity-50"><RefreshCw className="h-4 w-4"/>{busy===resource.id?"Processing…":"Retry"}</button></div></div>{open&&<div className="mt-4 space-y-2 border-t pt-4">{open.map((question)=><details key={question.id} className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">Q{question.question_number} · {question.topic}{question.subtopic?` / ${question.subtopic}`:""} · {question.difficulty}</summary><p className="mt-2 text-sm text-gray-600">{question.question_text}</p>{question.answer_text&&<p className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><b>Answer:</b> {question.answer_text}</p>}</details>)}{!open.length&&<p className="text-sm text-gray-500">No extracted questions for this resource.</p>}</div>}</article>;})}{!resources.length&&<p className="p-10 text-center text-gray-500">No resources uploaded yet.</p>}</section></div></AppLayout>;
}
