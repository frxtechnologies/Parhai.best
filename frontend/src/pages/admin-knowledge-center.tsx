import { API_BASE_URL, requestResourceProcessing, useIsAdmin, useListSubjects } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/context/auth-context";
import { requireSupabase } from "@/lib/supabase";
import {
  AlertTriangle, BarChart3, Book, Brain, Calendar, CheckSquare, ClipboardCheck,
  Edit3, FileCheck2, FilePlus2, FileText, Folder, GraduationCap, Lightbulb, Layers, Library,
  Lock, MessageSquare, Presentation, RefreshCw, Search, Sigma, Sparkles, StickyNote,
  Target, UploadCloud, UserCheck, Users, Video, X, Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect } from "wouter";

// ── Types ────────────────────────────────────────────────────────────────────
type Level = "O_LEVEL" | "A_LEVEL";
type Subject = { id: number; name: string; code: string; level: Level; board: string };
type Collection = { id: number; key: string; parent_key: string | null; name: string; icon: string; sort_order: number };

type KcResource = {
  id: number; title: string; resource_type: string; collection_id: number | null;
  visible_to_students: boolean; visible_to_ai: boolean; visible_to_training: boolean; visible_to_admin: boolean;
  is_approved: boolean; processing_status: string; year: number | null; taxonomy_topic_id: string | null;
  difficulty: string | null; source: string | null; confidence_score: number | null; subject_id: number;
  created_at: string; subjects: { name: string; code: string } | null;
};

type Dashboard = {
  windowDays: number;
  processingStatus: Array<{ resource_type: string; processing_status: string; resource_count: number; embedded_count: number; chunked_count: number }>;
  failedJobs: Array<{ id: number; title: string; resource_type: string; error_message: string | null }>;
  resources: { total: number; byType: Record<string, number>; approvedCount: number; studentVisibleCount: number; aiOnlyCount: number };
  knowledgeGraph: { totalEdges: number; byEdgeType: Record<string, number> };
  retrievalCoverage: Array<{ subjectId: string; totalQuestions: number; embedded: number; classified: number; embeddedRate: number; classifiedRate: number }>;
  datasetGrowth: { byVersion: Record<string, number>; bySource: Record<string, number>; totalRecentExamples: number };
  aiUsage: { totalQueries: number; strategyBreakdown: Record<string, number>; providerFailureRate: number; avgLatencyMs: number };
  aiModels: { active: Array<{ modelKey: string; version: string; accuracy: number | null; activatedAt: string }> };
  needsVerification: { questionsNeedingReview: number };
};

type DetectResult = {
  filename: string; matched: boolean; resourceType?: string; year?: number | null; session?: string | null;
  paperNumber?: number | null; variant?: number | null;
  subject?: { id: number; name: string; code: string; level: Level } | null;
};

type Insights = {
  windowDays: number;
  apiDependency: { localRate: number; apiRate: number; keywordRate: number; noneRate: number; total: number };
  subjects: Array<{
    subjectId: number; subjectCode: string; subjectName: string;
    weakTopics: Array<{ topicId: string; name: string; questionCount: number; needsReviewCount: number; reason: string; severity: number }>;
    missingResourceTypes: Array<{ resourceType: string; tier: "core" | "recommended" }>;
    suggestedUploads: Array<{ message: string; priority: "high" | "medium" }>;
  }>;
};

type QueueStatus = "queued" | "uploading" | "processing" | "done" | "error";
type QueueItem = {
  key: string; file: File; detected: DetectResult | null;
  subjectId: number | null; type: string; year: string; session: string; paperCode: string; variant: string;
  visStudents: boolean; visAi: boolean; visTraining: boolean;
  status: QueueStatus; stage: string | null; error: string | null; resourceId: number | null;
};

// ── Icon + collection presentation ──────────────────────────────────────────
const ICONS: Record<string, typeof Library> = {
  "graduation-cap": GraduationCap, "file-text": FileText, "check-square": CheckSquare,
  "message-square": MessageSquare, "bar-chart": BarChart3, "file-plus": FilePlus2,
  "user-check": UserCheck, "sticky-note": StickyNote, lock: Lock, calendar: Calendar,
  sigma: Sigma, book: Book, presentation: Presentation, users: Users, layers: Layers,
  "edit-3": Edit3, "clipboard-check": ClipboardCheck, video: Video, folder: Folder,
};
const iconFor = (key: string) => ICONS[key] ?? Folder;

const RESOURCE_LABELS: Record<string, string> = {
  PAST_PAPER: "Past Paper", MARKING_SCHEME: "Mark Scheme", EXAMINER_REPORT: "Examiner Report",
  GRADE_THRESHOLD: "Grade Threshold", SPECIMEN_PAPER: "Specimen Paper", INSERT: "Insert",
  TEACHER_NOTES: "Teacher Notes", PRIVATE_GUIDE: "Private Teaching Guide", LESSON_PLAN: "Lesson Plan",
  FORMULA_SHEET: "Formula Sheet", BOOK: "Book", SLIDES: "Slides", NOTES: "Notes", AI_NOTES: "AI Generated Notes",
  FLASHCARDS: "Flashcards", WORKSHEET: "Worksheet", TEST: "Practice Test", TOPICAL: "Topical",
  SYLLABUS: "Syllabus", VIDEO: "Video", SOURCE_FILE: "Source File", OTHER: "Other",
};

// Sensible visibility defaults by resource type — the admin can always override per file.
function defaultVisibility(type: string): { students: boolean; ai: boolean; training: boolean } {
  if (["PRIVATE_GUIDE", "TEACHER_NOTES", "LESSON_PLAN"].includes(type)) return { students: false, ai: true, training: true };
  if (type === "OTHER") return { students: false, ai: false, training: false };
  return { students: true, ai: true, training: true };
}

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

const STAGE_LABELS: Record<string, string> = {
  reading_pdf: "Reading PDF", extracting_questions: "Extracting text", embedding: "Generating embeddings",
  matching_mark_scheme: "Matching mark scheme", topic_classification: "Classifying topic",
  knowledge_graph: "Building knowledge graph", training_dataset: "Preparing training data", completed: "Completed",
};
const PIPELINE_STAGES = ["reading_pdf", "extracting_questions", "embedding", "matching_mark_scheme", "topic_classification", "knowledge_graph", "training_dataset", "completed"];

function StatCard({ icon: Icon, label, value, sub, tone = "indigo" }: { icon: typeof Brain; label: string; value: string | number; sub?: string; tone?: "indigo" | "violet" | "emerald" | "orange" | "rose" }) {
  const tones = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600" }, violet: { bg: "bg-violet-50", text: "text-violet-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600" }, orange: { bg: "bg-orange-50", text: "text-orange-600" },
    rose: { bg: "bg-rose-50", text: "text-rose-600" },
  } as const;
  const t = tones[tone];
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.bg}`}><Icon className={`h-4 w-4 ${t.text}`} /></div>
        <span className="font-medium text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#1E1B4B]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function VisPill({ on, label }: { on: boolean; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{label}</span>;
}

export default function AdminKnowledgeCenter() {
  const { isLoading } = useAuth();
  const { isAdmin, isResolved } = useIsAdmin();
  const { data: subjects = [] } = useListSubjects();
  const [tab, setTab] = useState<"library" | "upload" | "dashboard">("library");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null);
  const [resources, setResources] = useState<KcResource[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<KcResource | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadCollections = () => authedFetch("/api/admin/knowledge-center/collections").then((d) => setCollections((d as { collections: Collection[] }).collections)).catch(() => undefined);
  const loadDashboard = () => authedFetch("/api/admin/knowledge-center/dashboard").then((d) => setDashboard(d as Dashboard)).catch(() => undefined);
  const loadInsights = () => authedFetch("/api/admin/knowledge-center/insights").then((d) => setInsights(d as Insights)).catch(() => undefined);
  const loadResources = () => {
    const params = new URLSearchParams({ limit: "60" });
    if (activeCollectionId) params.set("collection_id", String(activeCollectionId));
    if (search.trim()) params.set("q", search.trim());
    return authedFetch(`/api/admin/knowledge-center/resources?${params}`).then((d) => setResources((d as { resources: KcResource[] }).resources)).catch(() => undefined);
  };

  useEffect(() => { if (isAdmin) { void loadCollections(); void loadDashboard(); void loadInsights(); } }, [isAdmin]);
  useEffect(() => { if (isAdmin) void loadResources(); }, [isAdmin, activeCollectionId, search]);

  // Keyboard-friendly: "/" focuses search, matching Linear/Notion convention.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && tab === "library") { e.preventDefault(); searchInputRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab]);

  const topLevel = useMemo(() => collections.filter((c) => !c.parent_key).sort((a, b) => a.sort_order - b.sort_order), [collections]);
  const childrenOf = (key: string) => collections.filter((c) => c.parent_key === key).sort((a, b) => a.sort_order - b.sort_order);

  if (isLoading || !isResolved) return null;
  if (!isAdmin) return <Redirect to="/dashboard" />;

  // ── Bulk upload queue ──────────────────────────────────────────────────────
  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    let detections: DetectResult[] = [];
    try {
      const res = await authedFetch("/api/admin/knowledge-center/detect", { method: "POST", body: JSON.stringify({ filenames: list.map((f) => f.name) }) });
      detections = (res as { results: DetectResult[] }).results;
    } catch { detections = list.map((f) => ({ filename: f.name, matched: false })); }

    const items: QueueItem[] = list.map((file, i) => {
      const d = detections[i] ?? { filename: file.name, matched: false };
      const type = d.resourceType ?? "OTHER";
      const vis = defaultVisibility(type);
      return {
        key: `${Date.now()}-${i}-${file.name}`, file, detected: d,
        subjectId: d.subject?.id ?? null, type, year: d.year ? String(d.year) : "", session: d.session ?? "",
        paperCode: d.paperNumber ? String(d.paperNumber) : "", variant: d.variant ? String(d.variant) : "",
        visStudents: vis.students, visAi: vis.ai, visTraining: vis.training,
        status: "queued", stage: null, error: null, resourceId: null,
      };
    });
    setQueue((q) => [...q, ...items]);
  }

  function updateQueueItem(key: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function uploadOne(item: QueueItem) {
    const subject = subjects.find((s: Subject) => s.id === item.subjectId);
    if (!subject) { updateQueueItem(item.key, { status: "error", error: "No subject detected — choose one manually." }); return; }
    updateQueueItem(item.key, { status: "uploading" });
    const client = requireSupabase();
    const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${subject.level}/${subject.code}/${item.type}/${item.year || "general"}/${Date.now()}-${safeName}`;
    try {
      const { error: storageError } = await client.storage.from("resources").upload(path, item.file, { contentType: item.file.type || undefined, upsert: false });
      if (storageError) throw storageError;
      const { data: resource, error } = await client.from("resources").insert({
        subject_id: subject.id, level: subject.level, board: subject.board, title: item.file.name,
        resource_type: item.type, year: item.year ? Number(item.year) : null, session: item.session || null,
        paper_code: item.paperCode.trim() || null, variant: item.variant ? Number(item.variant) : null,
        visible_to_students: item.visStudents, visible_to_ai: item.visAi, visible_to_training: item.visTraining,
        bucket: "resources", storage_path: path, file_path: path, file_url: path,
        original_filename: item.file.name, file_type: item.file.type || null, file_size_bytes: item.file.size,
        status: "uploaded", processing_status: "pending",
      }).select("id").single();
      if (error || !resource) { await client.storage.from("resources").remove([path]); throw error ?? new Error("Could not save resource metadata."); }
      updateQueueItem(item.key, { status: "processing", resourceId: resource.id, stage: "reading_pdf" });
      const { data: session } = await client.auth.getSession();
      void requestResourceProcessing(resource.id, session.session?.access_token ?? "").catch(() => undefined);
      pollStage(item.key, resource.id);
    } catch (err) {
      updateQueueItem(item.key, { status: "error", error: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  function pollStage(key: string, resourceId: number) {
    const client = requireSupabase();
    const interval = setInterval(async () => {
      const { data } = await client.from("processing_jobs").select("status,stage,error_message").eq("resource_id", resourceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return;
      if (data.status === "completed") { updateQueueItem(key, { status: "done", stage: "completed" }); clearInterval(interval); void loadResources(); void loadDashboard(); }
      else if (data.status === "failed") { updateQueueItem(key, { status: "error", error: data.error_message ?? "Processing failed", stage: data.stage }); clearInterval(interval); }
      else updateQueueItem(key, { stage: data.stage ?? null });
    }, 2500);
    setTimeout(() => clearInterval(interval), 10 * 60_000); // stop polling after 10 minutes
  }

  async function runQueue() {
    const CONCURRENCY = 4;
    const pending = queue.filter((i) => i.status === "queued");
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const item = pending[cursor++]!;
        await uploadOne(item);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await authedFetch(`/api/admin/knowledge-center/resources/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          visible_to_students: editing.visible_to_students, visible_to_ai: editing.visible_to_ai,
          visible_to_training: editing.visible_to_training, difficulty: editing.difficulty, source: editing.source,
        }),
      });
      setResources((rs) => rs.map((r) => (r.id === editing.id ? editing : r)));
      setEditing(null);
    } catch { setMessage("Could not save changes."); }
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-2rem)] gap-5 pb-4">
        {/* Collection sidebar */}
        <aside className="w-64 shrink-0 overflow-y-auto rounded-2xl border border-slate-200/60 bg-white p-3">
          <div className="mb-3 flex items-center gap-2 px-2 pt-1">
            <Brain className="h-5 w-5 text-indigo-600" />
            <span className="font-bold text-sm text-[#1E1B4B]">Knowledge Library</span>
          </div>
          <button onClick={() => setActiveCollectionId(null)} className={`mb-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium ${activeCollectionId === null ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <Library className="h-4 w-4" /> All resources
          </button>
          {topLevel.map((top) => {
            const TopIcon = iconFor(top.icon);
            const kids = childrenOf(top.key);
            return (
              <div key={top.key} className="mb-1">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                  <TopIcon className="h-3.5 w-3.5" /> {top.name}
                </div>
                {kids.length === 0 ? (
                  <button onClick={() => setActiveCollectionId(top.id)} className={`ml-4 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${activeCollectionId === top.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
                    {top.name}
                  </button>
                ) : kids.map((c) => {
                  const CIcon = iconFor(c.icon);
                  return (
                    <button key={c.key} onClick={() => setActiveCollectionId(c.id)} className={`ml-4 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${activeCollectionId === c.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
                      <CIcon className="h-3.5 w-3.5" /> {c.name}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>

        {/* Main workspace */}
        <div className="flex-1 overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              {(["library", "upload", "dashboard"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition ${tab === t ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {t === "upload" ? "Bulk Upload" : t === "dashboard" ? "AI Dashboard" : "Library"}
                </button>
              ))}
            </div>
            {tab === "library" && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input ref={searchInputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search resources… (press /)" className="w-72 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm" />
              </div>
            )}
          </div>

          {message && <div className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{message}</div>}

          {tab === "library" && (
            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              {resources.length === 0 ? (
                <div className="py-16 text-center">
                  <Folder className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p className="font-semibold text-slate-500">No resources here yet</p>
                  <p className="mt-1 text-sm text-slate-400">Switch to Bulk Upload to feed the brain.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-3">Title</th><th className="pb-2 pr-3">Type</th><th className="pb-2 pr-3">Subject</th>
                      <th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Visibility</th><th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50">
                        <td className="max-w-xs truncate py-2.5 pr-3 font-medium text-slate-700">{r.title}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{RESOURCE_LABELS[r.resource_type] ?? r.resource_type}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{r.subjects?.code ?? "—"}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.processing_status === "processed" ? "bg-emerald-50 text-emerald-700" : r.processing_status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{r.processing_status}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex gap-1">
                            <VisPill on={r.visible_to_students} label="S" />
                            <VisPill on={r.visible_to_ai} label="AI" />
                            <VisPill on={r.visible_to_training} label="Tr" />
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <button onClick={() => setEditing(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Edit3 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "upload" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 py-14 text-center transition hover:border-indigo-400 hover:bg-indigo-50"
              >
                <UploadCloud className="mb-3 h-10 w-10 text-indigo-400" />
                <p className="font-semibold text-indigo-900">Drag and drop PDFs here — 1 or 1,000</p>
                <p className="mt-1 text-xs text-indigo-500">Subject, paper, year, session and type are detected automatically from Cambridge filenames.</p>
                <input ref={fileInputRef} type="file" multiple accept=".pdf" className="hidden" onChange={(e) => e.target.files && void addFiles(e.target.files)} />
              </div>

              {queue.length > 0 && (
                <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-bold text-sm text-[#1E1B4B]">{queue.length} file{queue.length === 1 ? "" : "s"} queued — {queue.filter((i) => i.detected?.matched).length} auto-detected</p>
                    <div className="flex gap-2">
                      <button onClick={() => setQueue((q) => q.filter((i) => i.status !== "done"))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Clear completed</button>
                      <button onClick={() => void runQueue()} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md">
                        <Sparkles className="h-3.5 w-3.5" /> Process all
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                    {queue.map((item) => (
                      <div key={item.key} className="rounded-xl border border-slate-100 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            {item.detected?.matched ? <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                            <span className="truncate text-sm font-medium text-slate-700">{item.file.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.status === "queued" && <span className="text-[11px] text-slate-400">Ready</span>}
                            {(item.status === "uploading" || item.status === "processing") && (
                              <span className="flex items-center gap-1 text-[11px] font-medium text-indigo-600">
                                <RefreshCw className="h-3 w-3 animate-spin" /> {item.stage ? STAGE_LABELS[item.stage] ?? item.stage : "Uploading"}
                              </span>
                            )}
                            {item.status === "done" && <span className="text-[11px] font-semibold text-emerald-600">Done</span>}
                            {item.status === "error" && <span className="text-[11px] font-semibold text-rose-600">{item.error}</span>}
                            {item.status === "queued" && (
                              <button onClick={() => setQueue((q) => q.filter((i) => i.key !== item.key))} className="rounded p-1 text-slate-300 hover:text-rose-500"><X className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                        </div>

                        {(item.status === "processing") && (
                          <div className="mt-2 flex gap-0.5">
                            {PIPELINE_STAGES.map((s) => (
                              <div key={s} className={`h-1 flex-1 rounded-full ${PIPELINE_STAGES.indexOf(item.stage ?? "reading_pdf") >= PIPELINE_STAGES.indexOf(s) ? "bg-indigo-500" : "bg-slate-100"}`} />
                            ))}
                          </div>
                        )}

                        {item.status === "queued" && (
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                            <select value={item.subjectId ?? ""} onChange={(e) => updateQueueItem(item.key, { subjectId: e.target.value ? Number(e.target.value) : null })} className="col-span-2 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                              <option value="">Subject…</option>
                              {subjects.map((s: Subject) => <option key={s.id} value={s.id}>{s.code}</option>)}
                            </select>
                            <select value={item.type} onChange={(e) => updateQueueItem(item.key, { type: e.target.value })} className="col-span-2 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                              {Object.entries(RESOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                            <input value={item.year} onChange={(e) => updateQueueItem(item.key, { year: e.target.value })} placeholder="Year" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                            <div className="flex items-center gap-1">
                              {(["visStudents", "visAi", "visTraining"] as const).map((k, i) => (
                                <button key={k} type="button" onClick={() => updateQueueItem(item.key, { [k]: !item[k] } as Partial<QueueItem>)}
                                  className={`rounded px-1.5 py-1 text-[10px] font-bold ${item[k] ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"}`}>
                                  {["S", "AI", "Tr"][i]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "dashboard" && dashboard && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard icon={Library} label="Resources" value={dashboard.resources.total} sub={`${dashboard.resources.studentVisibleCount} student-visible`} />
                <StatCard icon={Target} label="Knowledge graph edges" value={dashboard.knowledgeGraph.totalEdges} tone="violet" />
                <StatCard icon={Sparkles} label="Training examples" value={dashboard.datasetGrowth.totalRecentExamples} sub={`last ${dashboard.windowDays}d`} tone="emerald" />
                <StatCard icon={AlertTriangle} label="Needs verification" value={dashboard.needsVerification.questionsNeedingReview} tone="orange" />
              </div>

              {insights && insights.apiDependency.total > 0 && (
                <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <h3 className="mb-1 flex items-center gap-2 font-bold text-sm text-[#1E1B4B]"><Zap className="h-4 w-4 text-emerald-500" /> API independence</h3>
                  <p className="mb-3 text-[11px] text-slate-400">Fraction of topic classifications answered by Parhai's own local model vs the external API, last {insights.windowDays}d ({insights.apiDependency.total} queries)</p>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-emerald-500" style={{ width: `${insights.apiDependency.localRate * 100}%` }} title="Local model" />
                    <div className="bg-indigo-400" style={{ width: `${insights.apiDependency.apiRate * 100}%` }} title="API teacher" />
                    <div className="bg-amber-300" style={{ width: `${insights.apiDependency.keywordRate * 100}%` }} title="Keyword fallback" />
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] text-slate-500">
                    <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Local model {Math.round(insights.apiDependency.localRate * 100)}%</span>
                    <span><span className="inline-block h-2 w-2 rounded-full bg-indigo-400" /> API teacher {Math.round(insights.apiDependency.apiRate * 100)}%</span>
                    <span><span className="inline-block h-2 w-2 rounded-full bg-amber-300" /> Keyword {Math.round(insights.apiDependency.keywordRate * 100)}%</span>
                  </div>
                </div>
              )}

              {insights && insights.subjects.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-bold text-sm text-amber-900"><Lightbulb className="h-4 w-4" /> What Parhai needs to get smarter</h3>
                  <div className="space-y-3">
                    {insights.subjects.map((s) => (
                      <div key={s.subjectId} className="rounded-xl bg-white p-3">
                        <p className="mb-1.5 text-xs font-bold text-slate-700">{s.subjectName} ({s.subjectCode})</p>
                        <div className="space-y-1">
                          {s.suggestedUploads.map((sug, i) => (
                            <p key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                              <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${sug.priority === "high" ? "bg-rose-400" : "bg-amber-400"}`} />
                              {sug.message}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dashboard.aiModels.active.length > 0 && (
                <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-4">
                  <h3 className="mb-2 flex items-center gap-2 font-bold text-sm text-indigo-900"><Brain className="h-4 w-4" /> Active local models</h3>
                  <div className="flex flex-wrap gap-2">
                    {dashboard.aiModels.active.map((m) => (
                      <span key={m.modelKey} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm">{m.modelKey} {m.version} — {m.accuracy !== null ? `${Math.round(m.accuracy * 100)}% accuracy` : "unscored"}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 font-bold text-sm text-[#1E1B4B]">Retrieval coverage by subject</h3>
                  {dashboard.retrievalCoverage.length === 0 && <p className="text-xs text-slate-400">No question data yet.</p>}
                  {dashboard.retrievalCoverage.map((c) => (
                    <div key={c.subjectId} className="mb-2 rounded-xl bg-slate-50 p-3">
                      <div className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
                        <span>Subject #{c.subjectId} · {c.totalQuestions} questions</span>
                        <span>{Math.round(c.embeddedRate * 100)}% embedded</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.round(c.embeddedRate * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 font-bold text-sm text-[#1E1B4B]"><AlertTriangle className="h-4 w-4 text-orange-500" /> Failed processing jobs</h3>
                  {dashboard.failedJobs.length === 0 ? <p className="text-xs text-slate-400">No failed jobs.</p> : (
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
            </div>
          )}
        </div>
      </div>

      {/* Edit drawer */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30" onClick={() => setEditing(null)}>
          <div className="h-full w-96 overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-[#1E1B4B]">Edit resource</h3>
              <button onClick={() => setEditing(null)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <p className="mb-4 truncate text-sm font-medium text-slate-600">{editing.title}</p>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Who can access this</p>
            <div className="mb-4 space-y-2">
              {([["visible_to_students", "Students", "Can view and download"], ["visible_to_ai", "AI", "Used to ground answers"], ["visible_to_training", "Training", "Used for the dataset/model pipeline"]] as const).map(([key, label, desc]) => (
                <label key={key} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                  <div><p className="text-sm font-medium text-slate-700">{label}</p><p className="text-[11px] text-slate-400">{desc}</p></div>
                  <input type="checkbox" checked={editing[key]} onChange={(e) => setEditing({ ...editing, [key]: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
                </label>
              ))}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Difficulty</p>
            <select value={editing.difficulty ?? ""} onChange={(e) => setEditing({ ...editing, difficulty: e.target.value || null })} className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Unset</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
            </select>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Source</p>
            <input value={editing.source ?? ""} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="e.g. teacher name, publisher" className="mb-5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />

            <button onClick={() => void saveEdit()} className="w-full rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 py-2.5 text-sm font-semibold text-white shadow-md">Save changes</button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
