import { AppLayout } from "@/components/layout/app-layout";
import { requireSupabase } from "@/lib/supabase";
import {
  getGetSubjectQueryKey,
  useGetSubject,
  useListQuestions,
} from "@/api/client";
import {
  BookOpen,
  Bot,
  CheckCircle2,
  Eye,
  FileText,
  LineChart,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";

const TABS = ["papers", "schemes", "notes", "worksheets", "tests", "topicals", "questions", "ai", "saved", "progress"] as const;
type Tab = (typeof TABS)[number];
type StudyResource = { id: number; title: string; resource_type: "PAST_PAPER" | "MARKING_SCHEME" | "GRADE_THRESHOLD" | "EXAMINER_REPORT" | "INSERT" | "SOURCE_FILE" | "NOTES" | "WORKSHEET" | "TEST" | "TOPICAL" | "SYLLABUS" | "OTHER"; year: number | null; session: string | null; paper_code: string | null; variant: number | null; bucket: string; storage_path: string; status: string; processing_status: string; related_resource_id: number | null };
const RESOURCE_TYPES: StudyResource["resource_type"][] = ["PAST_PAPER", "MARKING_SCHEME", "GRADE_THRESHOLD", "EXAMINER_REPORT", "INSERT", "SOURCE_FILE", "NOTES", "WORKSHEET", "TEST", "TOPICAL", "SYLLABUS", "OTHER"];
const resourceLabel = (type: StudyResource["resource_type"]) => ({ PAST_PAPER: "Past papers", MARKING_SCHEME: "Marking schemes", GRADE_THRESHOLD: "Grade thresholds", EXAMINER_REPORT: "Examiner reports", INSERT: "Inserts", SOURCE_FILE: "Source files", NOTES: "Notes", WORKSHEET: "Worksheets", TEST: "Tests", TOPICAL: "Topicals", SYLLABUS: "Syllabus", OTHER: "Other resources" })[type];

export default function SubjectDetail() {
  const params = useParams();
  const subjectId = Number.parseInt(params.id || "0", 10);
  const [activeTab, setActiveTab] = useState<Tab>("papers");
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [resources, setResources] = useState<StudyResource[]>([]);
  const [resourceError, setResourceError] = useState("");

  const { data: subject, isLoading } = useGetSubject(subjectId, {
    query: { enabled: !!subjectId, queryKey: getGetSubjectQueryKey(subjectId) },
  });
  const { data: questions } = useListQuestions({ subjectId }, { query: { queryKey: ["/api/questions", { subjectId }] } });
  useEffect(() => {
    if (!subjectId) return;
    const client = requireSupabase();
    const loadResources = async () => {
      const results = await Promise.all(RESOURCE_TYPES.map((resourceType) => client.from("resources").select("id,title,resource_type,year,session,paper_code,variant,bucket,storage_path,status,processing_status,related_resource_id").eq("subject_id", subjectId).eq("resource_type", resourceType).order("year", { ascending: false })));
      const failed = results.find((result) => result.error);
      if (failed?.error) { console.error("[resources] subject load failed", { subjectId, error: failed.error }); setResourceError(failed.error.message); }
      else { setResourceError(""); setResources(results.flatMap((result) => (result.data ?? []) as StudyResource[])); }
    };
    void loadResources();
    const channel = client.channel(`subject-resources-${subjectId}`).on("postgres_changes", { event: "*", schema: "public", table: "resources", filter: `subject_id=eq.${subjectId}` }, () => { void loadResources(); }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [subjectId]);

  async function openStudyResource(resource: StudyResource) {
    const { data, error } = await requireSupabase().storage.from(resource.bucket).createSignedUrl(resource.storage_path, 3600);
    if (error || !data) { setResourceError(error?.message ?? "Could not open resource."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-12 text-center text-gray-400">Loading subject...</div>
      </AppLayout>
    );
  }

  if (!subject) {
    return (
      <AppLayout>
        <div className="p-12 text-center text-red-500">Subject not found</div>
      </AppLayout>
    );
  }

  const questionPapers = resources.filter((resource) => resource.resource_type === "PAST_PAPER");
  const markSchemes = resources.filter((resource) => resource.resource_type === "MARKING_SCHEME");
  const notes = resources.filter((resource) => resource.resource_type === "NOTES");
  const worksheets = resources.filter((resource) => resource.resource_type === "WORKSHEET");
  const tests = resources.filter((resource) => resource.resource_type === "TEST");
  const topicals = resources.filter((resource) => resource.resource_type === "TOPICAL");
  return (
    <AppLayout>
      <div className="space-y-8">
        <header className="bg-white p-6 md:p-8 rounded-2xl border shadow-sm flex flex-col md:flex-row md:items-start gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: subject.color }} />
          <div className="p-4 rounded-xl shrink-0" style={{ backgroundColor: `${subject.color}15`, color: subject.color }}>
            <BookOpen className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-[#0B1F3A]">{subject.name}</h1>
              <span className="px-2 py-1 bg-gray-100 rounded-md text-sm font-mono text-gray-500">{subject.code}</span>
            </div>
            <p className="text-gray-500 max-w-2xl">{subject.description}</p>
          </div>
          <Link
            href={`/subject/${subject.id}/ai`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <Bot className="h-4 w-4" />
            Ask AI Assistant
          </Link>
        </header>

        <section className="space-y-5">
          <div><h2 className="text-2xl font-bold text-[#0B1F3A]">Study resources</h2><p className="text-sm text-gray-500">Everything uploaded for this subject, organised by resource type.</p></div>
          {resourceError&&<p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{resourceError}</p>}
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {RESOURCE_TYPES.map((type) => {
              const items = resources.filter((resource) => resource.resource_type === type);
              const label = resourceLabel(type);
              return <div key={type} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-[#0B1F3A]">{label}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-gray-500">{items.length}</span></div><div className="space-y-3">{items.map((resource)=><button key={resource.id} onClick={()=>openStudyResource(resource)} className="block w-full rounded-xl border p-3 text-left transition-colors hover:border-[#14B8A6] hover:bg-cyan-50/40"><p className="font-semibold text-[#0B1F3A]">{resource.title}</p><p className="mt-1 text-xs text-gray-500">{resource.year??"General"}{resource.session?` · ${resource.session.replace("_"," ")}`:""}{resource.paper_code?` · ${resource.paper_code}`:""}{resource.variant?` v${resource.variant}`:""}</p></button>)}{!items.length&&<p className="rounded-xl border border-dashed p-4 text-center text-sm text-gray-400">No {label.toLowerCase()} yet.</p>}</div></div>;
            })}
          </div>
        </section>

        <div className="flex gap-2 bg-white border rounded-xl p-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                activeTab === tab ? "bg-[#0B1F3A] text-white shadow-sm" : "text-gray-500 hover:text-[#0B1F3A]"
              }`}
            >
              {tab === "papers"
                ? `Past Papers (${questionPapers.length})`
                : tab === "schemes"
                  ? `Mark Schemes (${markSchemes.length})`
                  : tab === "questions"
                    ? `Topical Questions (${questions?.length ?? 0})`
                    : tab === "notes"
                      ? `Notes (${notes.length})`
                      : tab === "worksheets"
                        ? `Worksheets (${worksheets.length})`
                        : tab === "tests"
                          ? `Tests (${tests.length})`
                          : tab === "topicals"
                            ? `Topicals (${topicals.length})`
                      : tab === "ai"
                        ? "AI Tutor"
                        : tab === "saved"
                          ? "Saved Questions"
                          : "Progress"}
            </button>
          ))}
        </div>

        {activeTab === "papers" && (
          <PaperGroups papers={questionPapers} markingSchemes={markSchemes} onOpen={openStudyResource} />
        )}

        {activeTab === "schemes" && (
          <StudyResourceList
            emptyText="No mark schemes available yet"
            resources={markSchemes}
            onOpen={openStudyResource}
          />
        )}

        {activeTab === "questions" && (
          <div className="space-y-4">
            {questions?.map((q) => (
              <div key={q.id} className="bg-white rounded-xl border p-6">
                <div className="flex items-start justify-between mb-4 gap-4">
                  <div className="space-y-1">
                    <span className="text-sm text-gray-400">{q.topic}</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        q.difficulty === "HARD"
                          ? "bg-red-50 text-red-700"
                          : q.difficulty === "MEDIUM"
                            ? "bg-yellow-50 text-yellow-700"
                            : "bg-green-50 text-green-700"
                      }`}
                    >
                      {q.difficulty}
                    </span>
                  </div>
                  <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded shrink-0">{q.marks} marks</span>
                </div>
                <p className="text-[#0B1F3A] mb-6">{q.question}</p>
                {revealed[q.id] ? (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 text-green-800 font-semibold">
                      <CheckCircle2 className="h-5 w-5" /> Answer Key
                    </div>
                    <p className="text-gray-800">{q.answer}</p>
                    {q.markingPoints.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                        {q.markingPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      onClick={() => setRevealed((prev) => ({ ...prev, [q.id]: false }))}
                      className="text-sm text-gray-500 hover:text-[#0B1F3A] mt-2"
                    >
                      Hide Answer
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRevealed((prev) => ({ ...prev, [q.id]: true }))}
                    className="flex items-center gap-2 px-4 py-2 bg-[#0B1F3A]/10 text-[#0B1F3A] rounded-lg text-sm font-medium hover:bg-[#0B1F3A]/20 transition-colors"
                  >
                    <Eye className="h-4 w-4" /> Reveal Answer
                  </button>
                )}
              </div>
            ))}
            {(!questions || questions.length === 0) && (
              <div className="bg-white rounded-xl border p-12 text-center text-gray-400">No questions available yet</div>
            )}
          </div>
        )}

        {activeTab === "notes" && (
          <StudyResourceList resources={notes} emptyText="No notes available yet" onOpen={openStudyResource} />
        )}

        {activeTab === "worksheets" && <StudyResourceList resources={worksheets} emptyText="No worksheets available yet" onOpen={openStudyResource} />}
        {activeTab === "tests" && <StudyResourceList resources={tests} emptyText="No tests available yet" onOpen={openStudyResource} />}
        {activeTab === "topicals" && <StudyResourceList resources={topicals} emptyText="No topicals available yet" onOpen={openStudyResource} />}

        {activeTab === "ai" && (
          <div className="bg-white rounded-2xl border p-8 flex flex-col md:flex-row gap-6 md:items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-[#06B6D4]/10 p-4 text-[#06B6D4]">
                <Bot className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#0B1F3A]">AI Assistant for {subject.name}</h2>
                <p className="mt-2 max-w-2xl text-gray-500">
                  Open the scoped assistant for this subject. It searches Supabase directly and uses the configured AI provider only for grounded answers.
                </p>
              </div>
            </div>
            <Link
              href={`/subject/${subject.id}/ai`}
              className="rounded-xl bg-[#06B6D4] px-5 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-[#06B6D4]/20 transition-transform hover:-translate-y-0.5"
            >
              Open AI Assistant
            </Link>
          </div>
        )}

        {activeTab === "saved" && (
          <div className="bg-white rounded-2xl border p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-xl bg-amber-50 p-3 text-amber-500">
                <Star className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#0B1F3A]">Saved Questions</h2>
                <p className="text-sm text-gray-500">Bookmarked questions will appear here for quick revision.</p>
              </div>
            </div>
            <div className="rounded-xl border border-dashed bg-[#F8FAFC]/60 p-8 text-center text-gray-500">
              No saved questions yet. Save tricky questions from topical practice to build a focused revision list.
            </div>
          </div>
        )}

        {activeTab === "progress" && (
          <div className="grid md:grid-cols-[1fr_280px] gap-6">
            <div className="bg-white rounded-2xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-[#0B1F3A]">{subject.name} Progress</h2>
                  <p className="text-sm text-gray-500">Based on available papers, notes, and practice attempts.</p>
                </div>
                <LineChart className="h-6 w-6" style={{ color: subject.color }} />
              </div>
              <div className="mb-4 rounded-xl border border-dashed bg-gray-50 p-4 text-sm text-gray-500">
                Progress tracking will appear here after real attempts, saved work, and completion events are written to Supabase.
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <Metric label="Papers ready" value={questionPapers.length} />
                <Metric label="Topical questions" value={questions?.length ?? 0} />
                <Metric label="Revision notes" value={notes.length} />
              </div>
            </div>
            <div className="bg-[#0B1F3A] text-white rounded-2xl p-6">
              <div className="text-sm text-white/60 mb-2">Workspace status</div>
              <div className="text-xl font-bold mb-3">Awaiting study activity</div>
              <p className="text-sm text-white/70">
                Once students start working through real content, this panel can show the next recommended action.
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function PaperGroups({ papers, markingSchemes, onOpen }: { papers: StudyResource[]; markingSchemes: StudyResource[]; onOpen: (resource: StudyResource) => void }) {
  const groups = new Map<string, StudyResource[]>();
  for (const paper of papers) {
    const key = `${paper.year ?? "General"} · ${paper.session?.replace("_", " ") ?? "No session"}`;
    groups.set(key, [...(groups.get(key) ?? []), paper]);
  }
  if (!papers.length) return <div className="rounded-xl border bg-white p-12 text-center text-gray-400">No papers available yet</div>;
  return <div className="space-y-5">{[...groups.entries()].map(([group, rows]) => <section key={group} className="overflow-hidden rounded-xl border bg-white"><h3 className="border-b bg-slate-50 px-5 py-3 font-bold text-[#0B1F3A]">{group}</h3><div className="divide-y">{rows.sort((a,b)=>(a.paper_code??"").localeCompare(b.paper_code??"") || (a.variant??0)-(b.variant??0)).map((paper)=>{const scheme=markingSchemes.find((item)=>item.related_resource_id===paper.id);return <div key={paper.id} className="flex flex-wrap items-center gap-3 p-4"><FileText className="h-5 w-5 text-gray-400"/><div className="min-w-0 flex-1"><p className="truncate font-semibold text-[#0B1F3A]">{paper.title}</p><p className="text-sm text-gray-400">{paper.paper_code??"No paper code"}{paper.variant?` · v${paper.variant}`:""} · {paper.status}</p></div><button onClick={()=>onOpen(paper)} className="rounded-lg border px-3 py-2 text-sm">Question paper</button>{scheme?<button onClick={()=>onOpen(scheme)} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">Marking scheme</button>:<span className="text-xs text-gray-400">No marking scheme linked</span>}</div>})}</div></section>)}</div>;
}

function StudyResourceList({
  emptyText,
  resources,
  onOpen,
}: {
  emptyText: string;
  resources: StudyResource[];
  onOpen: (resource: StudyResource) => void;
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="divide-y">
        {resources.map((resource) => (
          <div key={resource.id} className="p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-gray-50 transition-colors">
            <FileText className="h-5 w-5 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#0B1F3A] truncate">{resource.title}</div>
              <div className="text-sm text-gray-400">
                {resource.year ?? "General"}{resource.session ? ` · ${resource.session.replace("_", " ")}` : ""}
                {resource.paper_code ? ` · ${resource.paper_code}` : ""}{resource.variant ? ` v${resource.variant}` : ""}
              </div>
            </div>
            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
              {resource.resource_type.replace("_", " ")}
            </span>
            <button onClick={() => onOpen(resource)} className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-100" title="Open resource">
              Open
            </button>
          </div>
        ))}
        {resources.length === 0 && <div className="p-12 text-center text-gray-400">{emptyText}</div>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="text-2xl font-bold text-[#0B1F3A]">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}
