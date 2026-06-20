import { AppLayout } from "@/components/layout/app-layout";
import {
  getGetSubjectQueryKey,
  useGetSubject,
  useListNotes,
  useListPapers,
  useListQuestions,
} from "@/api/client";
import {
  BookMarked,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FilePenLine,
  FileText,
  LineChart,
  Star,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";

const TABS = ["papers", "schemes", "notes", "questions", "ai", "saved", "progress"] as const;
type Tab = (typeof TABS)[number];

export default function SubjectDetail() {
  const params = useParams();
  const subjectId = Number.parseInt(params.id || "0", 10);
  const [activeTab, setActiveTab] = useState<Tab>("papers");
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const { data: subject, isLoading } = useGetSubject(subjectId, {
    query: { enabled: !!subjectId, queryKey: getGetSubjectQueryKey(subjectId) },
  });
  const { data: papers } = useListPapers({ subjectId }, { query: { queryKey: ["/api/papers", { subjectId }] } });
  const { data: notes } = useListNotes({ subjectId }, { query: { queryKey: ["/api/notes", { subjectId }] } });
  const { data: questions } = useListQuestions({ subjectId }, { query: { queryKey: ["/api/questions", { subjectId }] } });

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

  const questionPapers = papers?.filter((paper) => paper.type === "PAST_PAPER") ?? [];
  const markSchemes = papers?.filter((paper) => paper.type === "MARKING_SCHEME") ?? [];
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
                      ? `Notes (${notes?.length ?? 0})`
                      : tab === "ai"
                        ? "AI Tutor"
                        : tab === "saved"
                          ? "Saved Questions"
                          : "Progress"}
            </button>
          ))}
        </div>

        {activeTab === "papers" && (
          <PaperList
            emptyText="No papers available yet"
            icon="paper"
            papers={questionPapers}
            subjectColor={subject.color}
          />
        )}

        {activeTab === "schemes" && (
          <PaperList
            emptyText="No mark schemes available yet"
            icon="scheme"
            papers={markSchemes}
            subjectColor={subject.color}
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
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {notes?.map((note) => (
              <div key={note.id} className="bg-white rounded-xl border p-6 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-cyan-50 rounded-lg group-hover:bg-[#0B1F3A] transition-colors">
                    <FilePenLine className="h-5 w-5 text-[#0B1F3A] group-hover:text-white" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{note.topic}</span>
                </div>
                <h3 className="font-bold text-lg text-[#0B1F3A] mb-2 line-clamp-2">{note.title}</h3>
                <p className="text-sm text-gray-400 mb-4 line-clamp-2">{note.summary}</p>
                <div className="flex items-center justify-between text-xs text-gray-400 border-t pt-4">
                  <span className="truncate">{note.topic}</span>
                  <span className="flex items-center gap-1 shrink-0 ml-2">
                    <Clock className="h-3 w-3" /> {note.readingTime} min
                  </span>
                </div>
              </div>
            ))}
            {(!notes || notes.length === 0) && (
              <div className="md:col-span-2 lg:col-span-3 bg-white rounded-xl border p-12 text-center text-gray-400">
                No notes available yet
              </div>
            )}
          </div>
        )}

        {activeTab === "ai" && (
          <div className="bg-white rounded-2xl border p-8 flex flex-col md:flex-row gap-6 md:items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-[#06B6D4]/10 p-4 text-[#06B6D4]">
                <Bot className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#0B1F3A]">AI Assistant for {subject.name}</h2>
                <p className="mt-2 max-w-2xl text-gray-500">
                  Open the scoped assistant for this subject. It searches Supabase directly and uses Gemini only to answer from retrieved records.
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
                <Metric label="Revision notes" value={notes?.length ?? 0} />
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

function PaperList({
  emptyText,
  icon,
  papers,
}: {
  emptyText: string;
  icon: "paper" | "scheme";
  papers: NonNullable<ReturnType<typeof useListPapers>["data"]>;
  subjectColor: string;
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="divide-y">
        {papers.map((paper) => (
          <div key={paper.id} className="p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-gray-50 transition-colors">
            {icon === "scheme" ? (
              <BookMarked className="h-5 w-5 text-blue-500 shrink-0" />
            ) : (
              <FileText className="h-5 w-5 text-gray-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#0B1F3A] truncate">{paper.title}</div>
              <div className="text-sm text-gray-400">
                {paper.session.replace("_", " ")} {paper.year} - P{paper.paperNumber}
                {paper.variant ? ` v${paper.variant}` : ""}
              </div>
            </div>
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                paper.type === "MARKING_SCHEME" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {paper.type === "MARKING_SCHEME" ? "MS" : "QP"}
            </span>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Download resource">
              <Download className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        ))}
        {papers.length === 0 && <div className="p-12 text-center text-gray-400">{emptyText}</div>}
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
