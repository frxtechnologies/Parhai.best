import { useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useCheckPaper, useGetDashboard } from "@/api/client";
import type { MarkedQuestion, PaperReport } from "@/api/types";
import { CheckCircle2, ClipboardCheck, Loader2, Lock, Sparkles, Upload, X } from "lucide-react";

const MAX_PAGES = 20;

export default function PaperChecker() {
  const { data: dashboard } = useGetDashboard();
  const subjects = useMemo(() => dashboard?.subjectProgress ?? [], [dashboard]);

  const [files, setFiles] = useState<File[]>([]);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [error, setError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const { mutate, data: report, isPending, reset } = useCheckPaper();

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setError("");
    setFiles((current) => [...current, ...Array.from(incoming)].slice(0, MAX_PAGES));
  };

  const handleCheck = () => {
    setError("");
    if (files.length === 0) return setError("Upload the completed answer sheet.");
    mutate({ files, subjectId: subjectId === "" ? null : Number(subjectId) }, { onError: (err) => setError(err.message) });
  };

  const startOver = () => { setFiles([]); setError(""); reset(); };

  return (
    <AppLayout>
      <div className="space-y-6 pb-10">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><ClipboardCheck className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0B1F3A]">AI Paper Checker</h1>
              <p className="mt-1 text-sm text-slate-500">Upload a completed answer sheet and get marks against the official scheme.</p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" /> Your answer sheet is processed in memory and never stored.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">Subject (optional)</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">Auto-detect from the paper</option>
                {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>)}
              </select>
            </div>

            <button type="button" onClick={() => uploadRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 py-8 text-sm font-medium text-slate-600 transition hover:border-teal-400 hover:text-teal-700">
              <Upload className="h-5 w-5" /> Upload pages
            </button>
            <input ref={uploadRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <p className="text-xs text-slate-400">Up to {MAX_PAGES} page images or a PDF.</p>

            {files.length > 0 && (
              <ul className="space-y-2">
                {files.map((file, index) => (
                  <li key={index} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span className="truncate text-slate-600">{file.name}</span>
                    <button type="button" onClick={() => setFiles((c) => c.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={handleCheck} disabled={isPending || files.length === 0} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#142f50] disabled:opacity-50">
                {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Marking…</> : <><Sparkles className="h-4 w-4" /> Check paper</>}
              </button>
              {(report || files.length > 0) && <button type="button" onClick={startOver} className="rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>}
            </div>
          </section>

          <section>
            {isPending ? <MarkingState /> : report ? <ReportView report={report} /> : <EmptyState />}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function ReportView({ report }: { report: PaperReport }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <ScoreCard label="Score" value={`${report.totalAwarded}/${report.totalPossible}`} />
        <ScoreCard label="Percentage" value={`${report.percentage}%`} />
        <ScoreCard label="Estimated grade" value={report.grade} highlight />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TopicCard title="Strong topics" topics={report.strongTopics} tone="teal" empty="No standout strengths yet." />
        <TopicCard title="Weak topics" topics={report.weakTopics} tone="amber" empty="No major weak areas — well done." />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0B1F3A]">Question-by-question feedback</h2>
          {!report.usedGroundedSources && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">No official scheme found — estimated</span>}
        </div>
        <div className="space-y-3">
          {report.questions.map((question, index) => <QuestionCard key={index} question={question} />)}
        </div>
      </div>

      {report.sources.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-[#0B1F3A]">Marking sources</p>
          <ul className="space-y-1 text-xs text-slate-500">
            {report.sources.map((source) => <li key={source.index}>[S{source.index}] <span className="uppercase text-slate-400">{source.type.replace("_", " ")}</span> — {source.reference}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ question }: { question: MarkedQuestion }) {
  const full = question.totalMarks > 0 && question.awardedMarks === question.totalMarks;
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#0B1F3A]">Question {question.questionNumber}</span>
          {question.topic && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{question.topic}</span>}
        </div>
        <span className={`inline-flex items-center gap-1 text-sm font-semibold ${full ? "text-teal-700" : "text-[#0B1F3A]"}`}>
          {full && <CheckCircle2 className="h-4 w-4" />}{question.awardedMarks}/{question.totalMarks}
        </span>
      </div>
      {question.whatWentWell && <p className="text-xs leading-5 text-slate-600"><span className="font-semibold text-teal-700">Well done:</span> {question.whatWentWell}</p>}
      {question.missingPoints && <p className="mt-1 text-xs leading-5 text-slate-600"><span className="font-semibold text-amber-700">Missing:</span> {question.missingPoints}</p>}
      {question.modelAnswer && <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-slate-500">Model answer</summary><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{question.modelAnswer}</p></details>}
    </div>
  );
}

function ScoreCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 text-center shadow-sm ${highlight ? "border-teal-200 bg-teal-50/50" : "border-slate-200 bg-white"}`}>
      <p className="text-3xl font-semibold text-[#0B1F3A]">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

function TopicCard({ title, topics, tone, empty }: { title: string; topics: string[]; tone: "teal" | "amber"; empty: string }) {
  const toneClass = tone === "teal" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-[#0B1F3A]">{title}</p>
      {topics.length ? (
        <div className="flex flex-wrap gap-2">{topics.map((topic) => <span key={topic} className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>{topic}</span>)}</div>
      ) : <p className="text-xs text-slate-400">{empty}</p>}
    </div>
  );
}

function MarkingState() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      <p className="mt-3 text-sm text-slate-500">Reading answers and marking against the official scheme…</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
      <ClipboardCheck className="h-8 w-8 text-slate-300" />
      <h2 className="mt-3 font-semibold text-[#0B1F3A]">Your marked report will appear here</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">Upload your completed answer sheet and Parhai will mark it, estimate a grade, and show where you lost marks.</p>
    </div>
  );
}
