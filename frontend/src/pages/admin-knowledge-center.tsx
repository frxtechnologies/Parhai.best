import { API_BASE_URL, requestResourceProcessing, useIsAdmin, useListSubjects } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/context/auth-context";
import { requireSupabase } from "@/lib/supabase";
import {
  AlertTriangle, BookOpen, Brain, Database, FileUp, GitBranch,
  Loader2, Lock, Network, RefreshCw, Shield, Sparkles, TrendingUp, Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Redirect } from "wouter";

// ── Knowledge type taxonomy ─────────────────────────────────────────────────
type ResourceType =
  | "PAST_PAPER" | "MARKING_SCHEME" | "EXAMINER_REPORT" | "GRADE_THRESHOLD"
  | "TEACHER_NOTES" | "PRIVATE_GUIDE" | "FORMULA_SHEET" | "BOOK" | "FLASHCARDS"
  | "AI_NOTES" | "NOTES" | "WORKSHEET" | "TEST" | "TOPICAL" | "SYLLABUS"
  | "VIDEO" | "INSERT" | "SOURCE_FILE" | "OTHER";

const RESOURCE_TYPE_GROUPS: Array<{ label: string; types: ResourceType[] }> = [
  { label: "Exam materials", types: ["PAST_PAPER", "MARKING_SCHEME", "EXAMINER_REPORT", "GRADE_THRESHOLD", "INSERT"] },
  { label: "Teaching knowledge", types: ["TEACHER_NOTES", "PRIVATE_GUIDE", "FORMULA_SHEET", "BOOK", "FLASHCARDS"] },
  { label: "AI-generated / practice", types: ["AI_NOTES", "NOTES", "WORKSHEET", "TEST", "TOPICAL"] },
  { label: "Reference", types: ["SYLLABUS", "VIDEO", "SOURCE_FILE", "OTHER"] },
];
const RESOURCE_LABELS: Record<ResourceType, string> = {
  PAST_PAPER: "Past Paper", MARKING_SCHEME: "Mark Scheme", EXAMINER_REPORT: "Examiner Report",
  GRADE_THRESHOLD: "Grade Threshold", TEACHER_NOTES: "Teacher Notes", PRIVATE_GUIDE: "Private Teaching Guide",
  FORMULA_SHEET: "Formula Sheet", BOOK: "Book", FLASHCARDS: "Flashcards", AI_NOTES: "AI Generated Notes",
  NOTES: "Notes", WORKSHEET: "Worksheet", TEST: "Test", TOPICAL: "Topical", SYLLABUS: "Syllabus",
  VIDEO: "Video", INSERT: "Insert", SOURCE_FILE: "Source File", OTHER: "Other",
};

type Visibility = "PUBLIC" | "AI_PRIVATE" | "TRAINING_ONLY" | "ADMIN_ONLY";
const VISIBILITY_INFO: Record<Visibility, { label: string; desc: string; color: string }> = {
  PUBLIC: { label: "Public", desc: "Students can view and download", color: "emerald" },
  AI_PRIVATE: { label: "AI Private", desc: "AI grounds answers in it; students never see or download it", color: "indigo" },
  TRAINING_ONLY: { label: "Training Only", desc: "Used only for the dataset/model pipeline, never for live answers", color: "violet" },
  ADMIN_ONLY: { label: "Admin Only", desc: "Not used by the AI at all — staff reference only", color: "slate" },
};

type Subject = { id: number; name: string; code: string; level: "O_LEVEL" | "A_LEVEL"; board: string };
type TaxonomyTopic = { id: string; name: string; level: 1 | 2; parent_id: string | null };

type Dashboard = {
  windowDays: number;
  processingStatus: Array<{ resource_type: string; visibility: string; processing_status: string; resource_count: number; extracted_count: number; chunked_count: number; embedded_count: number }>;
  failedJobs: Array<{ id: number; title: string; resource_type: string; error_message: string | null; retry_count: number; updated_at: string }>;
  resources: { total: number; byType: Record<string, number>; byVisibility: Record<string, number>; approvedCount: number };
  knowledgeGraph: { totalEdges: number; byEdgeType: Record<string, number> };
  retrievalCoverage: Array<{ subjectId: string; totalQuestions: number; embedded: number; classified: number; embeddedRate: number; classifiedRate: number }>;
  datasetGrowth: { byDay: Record<string, number>; byVersion: Record<string, number>; bySource: Record<string, number>; totalRecentExamples: number };
  aiUsage: { totalQueries: number; strategyBreakdown: Record<string, number>; providerFailureRate: number; avgLatencyMs: number };
};

type KcResource = {
  id: number; title: string; resource_type: string; visibility: Visibility; is_approved: boolean;
  processing_status: string; year: number | null; taxonomy_topic_id: string | null; difficulty: string | null;
  source: string | null; confidence_score: number | null; subject_id: number; created_at: string;
  subjects: { name: string; code: string } | null;
};

async function authedFetch(path: string, init: RequestInit = {}) {
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token ?? "";
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `Request failed (${res.status})`);
  return res.json();
}

// Tailwind can't detect classes built via template-literal interpolation
// (`bg-${color}-50`) — it needs complete literal strings in the source to
// generate the CSS. This map keeps every combination statically written out.
const STAT_CARD_COLORS = {
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600" },
} as const;

function StatCard({ icon: Icon, label, value, sub, color = "indigo" }: { icon: typeof Brain; label: string; value: string | number; sub?: string; color?: keyof typeof STAT_CARD_COLORS }) {
  const c = STAT_CARD_COLORS[color];
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon className={`h-4 w-4 ${c.text}`} />
        </div>
        <span className="font-medium text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#1E1B4B]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

export default function AdminKnowledgeCenter() {
  const { isLoading } = useAuth();
  const { isAdmin, isResolved } = useIsAdmin();
  const { data: subjects = [] } = useListSubjects();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [resources, setResources] = useState<KcResource[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyTopic[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    subjectId: "", type: "PAST_PAPER" as ResourceType, title: "", year: "", session: "",
    paperCode: "", variant: "", visibility: "PUBLIC" as Visibility, source: "", taxonomyTopicId: "", difficulty: "",
  });

  const loadDashboard = () => authedFetch("/api/admin/knowledge-center/dashboard").then((d) => setDashboard(d as Dashboard)).catch(() => undefined);
  const loadResources = () => authedFetch("/api/admin/knowledge-center/resources?limit=40").then((d) => setResources((d as { resources: KcResource[] }).resources)).catch(() => undefined);
  const loadTaxonomy = () => authedFetch("/api/admin/physics/taxonomy").then((d) => setTaxonomy((d as { topics: TaxonomyTopic[] }).topics)).catch(() => undefined);

  useEffect(() => {
    if (!isAdmin) return;
    void loadDashboard();
    void loadResources();
    void loadTaxonomy();
  }, [isAdmin]);

  const subtopics = useMemo(() => taxonomy.filter((t) => t.level === 2), [taxonomy]);
  const topicName = (id: string | null) => taxonomy.find((t) => t.id === id)?.name ?? id ?? "—";

  if (isLoading || !isResolved) return null;
  if (!isAdmin) return <Redirect to="/dashboard" />;

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file || !form.subjectId) { setMessage("Choose a subject and a file."); return; }
    setBusy(true);
    setMessage("");
    const client = requireSupabase();
    const subject = subjects.find((s) => s.id === Number(form.subjectId));
    if (!subject) { setBusy(false); setMessage("Choose a valid subject."); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${subject.level}/${subject.code}/${form.type}/${form.year || "general"}/${Date.now()}-${safeName}`;
    try {
      const { error: storageError } = await client.storage.from("resources").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (storageError) throw storageError;
      const { data: resource, error } = await client.from("resources").insert({
        subject_id: subject.id, level: subject.level, board: subject.board,
        title: form.title.trim() || file.name, resource_type: form.type,
        year: form.year ? Number(form.year) : null, session: form.session || null,
        paper_code: form.paperCode.trim() || null, variant: form.variant ? Number(form.variant) : null,
        visibility: form.visibility, source: form.source.trim() || null,
        taxonomy_topic_id: form.taxonomyTopicId || null, difficulty: form.difficulty || null,
        bucket: "resources", storage_path: path, file_path: path, file_url: path,
        original_filename: file.name, file_type: file.type || null, file_size_bytes: file.size,
        status: "uploaded", processing_status: "pending",
      }).select("id,resource_type,title").single();
      if (error || !resource) { await client.storage.from("resources").remove([path]); throw error ?? new Error("Could not save resource metadata."); }
      const { data: session } = await client.auth.getSession();
      const response = await requestResourceProcessing(resource.id, session.session?.access_token ?? "");
      const processing = (response.status === 202 ? {} : await response.json().catch(() => ({}))) as { chunks?: number; error?: string };
      setMessage(response.status === 202
        ? `${RESOURCE_LABELS[form.type]} uploaded to ${subject.name}. Knowledge Center processing (OCR, chunking, embeddings, topic linking) is running in the background.`
        : `${RESOURCE_LABELS[form.type]} uploaded and processed into ${processing.chunks ?? 0} chunks.`);
      setFile(null);
      setForm((f) => ({ ...f, title: "", paperCode: "", variant: "" }));
      await Promise.all([loadResources(), loadDashboard()]);
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updateVisibility(id: number, visibility: Visibility) {
    try {
      await authedFetch(`/api/admin/knowledge-center/resources/${id}`, { method: "PATCH", body: JSON.stringify({ visibility }) });
      setResources((rs) => rs.map((r) => (r.id === id ? { ...r, visibility } : r)));
    } catch {
      setMessage("Could not update visibility.");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-8 pb-8">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl p-8" style={{ background: "linear-gradient(135deg, #0C0A1E 0%, #1a1640 100%)" }}>
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-4 py-2">
              <Brain className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300">Central intelligence hub</span>
            </div>
            <h1 className="text-3xl font-bold text-white">AI Knowledge Center</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              Every document Parhai's AI reasons from — papers, mark schemes, examiner reports, teacher knowledge, and
              generated notes — classified, embedded, linked into the knowledge graph, and access-controlled.
            </p>
          </div>
        </div>

        {message && (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{message}</div>
        )}

        {/* Dashboard */}
        {dashboard && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[#1E1B4B]">System status</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard icon={Database} label="Total resources" value={dashboard.resources.total} sub={`${dashboard.resources.approvedCount} approved`} />
              <StatCard icon={GitBranch} label="Knowledge graph edges" value={dashboard.knowledgeGraph.totalEdges} color="violet" />
              <StatCard icon={Sparkles} label="Training examples (recent)" value={dashboard.datasetGrowth.totalRecentExamples} sub={`last ${dashboard.windowDays}d`} color="emerald" />
              <StatCard icon={TrendingUp} label="AI queries" value={dashboard.aiUsage.totalQueries} sub={`${dashboard.aiUsage.avgLatencyMs}ms avg`} color="orange" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Retrieval coverage */}
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 font-bold text-sm text-[#1E1B4B]"><Network className="h-4 w-4 text-indigo-500" /> Retrieval coverage by subject</h3>
                <div className="space-y-2">
                  {dashboard.retrievalCoverage.length === 0 && <p className="text-xs text-slate-400">No question data yet.</p>}
                  {dashboard.retrievalCoverage.map((c) => (
                    <div key={c.subjectId} className="rounded-xl bg-slate-50 p-3">
                      <div className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
                        <span>Subject #{c.subjectId} · {c.totalQuestions} questions</span>
                        <span>{Math.round(c.embeddedRate * 100)}% embedded · {Math.round(c.classifiedRate * 100)}% classified</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.round(c.embeddedRate * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Failed jobs */}
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 font-bold text-sm text-[#1E1B4B]"><AlertTriangle className="h-4 w-4 text-orange-500" /> Failed processing jobs</h3>
                {dashboard.failedJobs.length === 0 ? (
                  <p className="text-xs text-slate-400">No failed jobs.</p>
                ) : (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto">
                    {dashboard.failedJobs.map((j) => (
                      <div key={j.id} className="rounded-lg border border-orange-100 bg-orange-50 p-2 text-xs">
                        <p className="font-semibold text-orange-800">{j.title}</p>
                        <p className="text-orange-600">{j.error_message?.slice(0, 100) ?? "Unknown error"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <h3 className="mb-2 font-bold text-xs uppercase tracking-wide text-slate-400">By visibility</h3>
                {Object.entries(dashboard.resources.byVisibility).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-0.5 text-xs"><span className="text-slate-600">{VISIBILITY_INFO[k as Visibility]?.label ?? k}</span><span className="font-semibold">{v}</span></div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <h3 className="mb-2 font-bold text-xs uppercase tracking-wide text-slate-400">Dataset by source</h3>
                {Object.entries(dashboard.datasetGrowth.bySource).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-0.5 text-xs"><span className="text-slate-600">{k}</span><span className="font-semibold">{v}</span></div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <h3 className="mb-2 font-bold text-xs uppercase tracking-wide text-slate-400">Retrieval strategy mix</h3>
                {Object.entries(dashboard.aiUsage.strategyBreakdown).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-0.5 text-xs"><span className="text-slate-600">{k}</span><span className="font-semibold">{v}</span></div>
                ))}
                {dashboard.aiUsage.totalQueries === 0 && <p className="text-xs text-slate-400">No queries logged yet.</p>}
              </div>
            </div>
          </div>
        )}

        {/* Upload */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[#1E1B4B]"><FileUp className="h-5 w-5 text-indigo-500" /> Add knowledge</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.subjectId} onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))} required>
                <option value="">Choose subject</option>
                {subjects.map((s: Subject) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Resource type</p>
              {RESOURCE_TYPE_GROUPS.map((group) => (
                <div key={group.label} className="mb-2">
                  <p className="mb-1 text-[11px] font-medium text-slate-400">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.types.map((t) => (
                      <button type="button" key={t} onClick={() => setForm((f) => ({ ...f, type: t }))}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${form.type === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {RESOURCE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Year" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.session} onChange={(e) => setForm((f) => ({ ...f, session: e.target.value }))}>
                <option value="">No session</option>
                <option value="MAY_JUNE">May/June</option>
                <option value="OCT_NOV">Oct/Nov</option>
                <option value="FEB_MAR">Feb/March</option>
              </select>
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Paper code" value={form.paperCode} onChange={(e) => setForm((f) => ({ ...f, paperCode: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Variant" value={form.variant} onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value }))} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.taxonomyTopicId} onChange={(e) => setForm((f) => ({ ...f, taxonomyTopicId: e.target.value }))}>
                <option value="">Topic — auto-classify after upload</option>
                {subtopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}>
                <option value="">Difficulty — unset</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Source (e.g. teacher name, publisher)" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Visibility</p>
              <div className="grid gap-2 md:grid-cols-4">
                {(Object.keys(VISIBILITY_INFO) as Visibility[]).map((v) => (
                  <button type="button" key={v} onClick={() => setForm((f) => ({ ...f, visibility: v }))}
                    className={`rounded-xl border p-3 text-left transition ${form.visibility === v ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center gap-1.5">
                      {v === "PUBLIC" ? <Users className="h-3.5 w-3.5 text-emerald-600" /> : v === "ADMIN_ONLY" ? <Shield className="h-3.5 w-3.5 text-slate-600" /> : <Lock className="h-3.5 w-3.5 text-indigo-600" />}
                      <span className="text-xs font-bold">{VISIBILITY_INFO[v].label}</span>
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{VISIBILITY_INFO[v].desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" required />

            <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Upload & process
            </button>
          </form>
        </div>

        {/* Resource browser */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-[#1E1B4B]"><BookOpen className="h-5 w-5 text-indigo-500" /> Knowledge resources</h2>
            <button onClick={() => { void loadResources(); void loadDashboard(); }} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3">Title</th><th className="pb-2 pr-3">Type</th><th className="pb-2 pr-3">Subject</th>
                  <th className="pb-2 pr-3">Topic</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Visibility</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-700">{r.title}</td>
                    <td className="py-2 pr-3 text-slate-500">{RESOURCE_LABELS[r.resource_type as ResourceType] ?? r.resource_type}</td>
                    <td className="py-2 pr-3 text-slate-500">{r.subjects?.code ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-500">{topicName(r.taxonomy_topic_id)}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.processing_status === "processed" ? "bg-emerald-50 text-emerald-700" : r.processing_status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{r.processing_status}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <select value={r.visibility} onChange={(e) => void updateVisibility(r.id, e.target.value as Visibility)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                        {(Object.keys(VISIBILITY_INFO) as Visibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_INFO[v].label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {resources.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-xs text-slate-400">No resources yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
