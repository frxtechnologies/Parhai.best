import { useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetDashboard, useSolveQuestion } from "@/api/client";
import type { SolvedQuestion } from "@/api/types";
import { AlertTriangle, Camera, Loader2, RefreshCw, ScanText, Sparkles, Upload, X } from "lucide-react";

const MAX_FILES = 5;

export default function QuestionSolver() {
  const { data: dashboard } = useGetDashboard();
  const subjects = useMemo(() => dashboard?.subjectProgress ?? [], [dashboard]);

  const [files, setFiles] = useState<File[]>([]);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [error, setError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const { mutate, data: result, isPending, reset } = useSolveQuestion();

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setError("");
    setFiles((current) => [...current, ...Array.from(incoming)].slice(0, MAX_FILES));
  };

  const removeFile = (index: number) => setFiles((current) => current.filter((_, i) => i !== index));

  const handleSolve = () => {
    setError("");
    if (files.length === 0) return setError("Add a photo, screenshot, or PDF of the question.");
    mutate({ files, subjectId: subjectId === "" ? null : Number(subjectId) }, { onError: (err) => setError(err.message) });
  };

  const startOver = () => {
    setFiles([]);
    setError("");
    reset();
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-10">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><ScanText className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0B1F3A]">AI Question Solver</h1>
              <p className="mt-1 text-sm text-slate-500">Snap or upload any Cambridge question and get a grounded, step-by-step solution.</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">Subject (optional)</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">Auto-detect from the image</option>
                {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => uploadRef.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 py-6 text-sm font-medium text-slate-600 transition hover:border-teal-400 hover:text-teal-700">
                <Upload className="h-5 w-5" /> Upload
              </button>
              <button type="button" onClick={() => cameraRef.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 py-6 text-sm font-medium text-slate-600 transition hover:border-teal-400 hover:text-teal-700">
                <Camera className="h-5 w-5" /> Camera
              </button>
            </div>
            <input ref={uploadRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <p className="text-xs text-slate-400">Up to {MAX_FILES} images or a PDF. Photos are processed and never stored.</p>

            {files.length > 0 && (
              <ul className="space-y-2">
                {files.map((file, index) => (
                  <li key={index} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span className="truncate text-slate-600">{file.name}</span>
                    <button type="button" onClick={() => removeFile(index)} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={handleSolve} disabled={isPending || files.length === 0} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#142f50] disabled:opacity-50">
                {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Solving…</> : <><Sparkles className="h-4 w-4" /> Solve question</>}
              </button>
              {(result || files.length > 0) && (
                <button type="button" onClick={startOver} className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
              )}
            </div>
          </section>

          <section>
            {isPending ? <SolvingState /> : result ? <SolutionView result={result} onRetake={startOver} /> : <EmptyState />}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function SolutionView({ result, onRetake }: { result: SolvedQuestion; onRetake: () => void }) {
  if (result.needsRetake) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-10 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <h2 className="mt-3 font-semibold text-[#0B1F3A]">Image was hard to read</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-600">The question wasn't clear enough to solve reliably (confidence {(result.extraction.confidence * 100).toFixed(0)}%). Retake the photo with good lighting and the full question in frame.</p>
        <button type="button" onClick={onRetake} className="mt-4 rounded-lg bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-white">Try again</button>
      </div>
    );
  }

  const { extraction } = result;
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {extraction.topic && <Tag>{extraction.topic}</Tag>}
          {result.matchedSubject && <Tag>{result.matchedSubject.name}</Tag>}
          {extraction.marks != null && <Tag>{extraction.marks} marks</Tag>}
          <Tag>OCR {(extraction.confidence * 100).toFixed(0)}%</Tag>
          {result.usedGroundedSources ? <Tag tone="teal">Grounded in Cambridge sources</Tag> : <Tag tone="amber">General knowledge</Tag>}
        </div>
        <p className="text-sm font-medium text-slate-500">Detected question</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-[#0B1F3A]">{extraction.questionText}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-6 text-slate-700">{result.answer}</div>
      </div>

      {result.sources && result.sources.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-[#0B1F3A]">Sources</p>
          <ul className="space-y-1 text-xs text-slate-500">
            {result.sources.map((source) => (
              <li key={source.index}>[S{source.index}] <span className="uppercase text-slate-400">{source.type.replace("_", " ")}</span> — {source.reference}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tag({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "teal" | "amber" }) {
  const tones = { slate: "bg-slate-100 text-slate-600", teal: "bg-teal-50 text-teal-700", amber: "bg-amber-50 text-amber-700" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function SolvingState() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      <p className="mt-3 text-sm text-slate-500">Reading the question and searching Cambridge resources…</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
      <ScanText className="h-8 w-8 text-slate-300" />
      <h2 className="mt-3 font-semibold text-[#0B1F3A]">Your solution will appear here</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">Upload or photograph a question, and Parhai will transcribe it, find the marking scheme, and explain every step.</p>
    </div>
  );
}
