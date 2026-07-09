import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGenerateNotes, useGetDashboard } from "@/api/client";
import type { GeneratedNotes, NoteType } from "@/api/types";
import { Check, Copy, Download, FileText, Loader2, Printer, Sparkles } from "lucide-react";

const NOTE_TYPES: Array<{ value: NoteType; label: string }> = [
  { value: "summary", label: "Summary Notes" },
  { value: "detailed", label: "Detailed Notes" },
  { value: "flashcards", label: "Flashcards" },
  { value: "definitions", label: "Key Definitions" },
  { value: "formula_sheet", label: "Formula Sheet" },
  { value: "checklist", label: "Revision Checklist" },
  { value: "mind_map", label: "Mind Map" },
  { value: "memory_tricks", label: "Memory Tricks" },
  { value: "last_minute", label: "Last-Minute Revision" },
];

export default function NotesGenerator() {
  const { data: dashboard } = useGetDashboard();
  const subjects = useMemo(() => dashboard?.subjectProgress ?? [], [dashboard]);

  const [subjectId, setSubjectId] = useState<number | "">("");
  const [topic, setTopic] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("summary");
  const [error, setError] = useState("");

  const { mutate, data: notes, isPending } = useGenerateNotes();

  const handleGenerate = () => {
    setError("");
    const chosenSubject = subjectId === "" ? subjects[0]?.subjectId : Number(subjectId);
    if (!chosenSubject) return setError("Select a subject (add subjects in onboarding first).");
    if (!topic.trim()) return setError("Enter a topic, e.g. “Momentum” or “Circle Theorems”.");
    mutate({ subjectId: chosenSubject, topic: topic.trim(), noteType }, { onError: (err) => setError(err.message) });
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-10">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><FileText className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0B1F3A]">AI Notes Generator</h1>
              <p className="mt-1 text-sm text-slate-500">Generate revision material grounded in your Cambridge resources, with citations.</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">{subjects[0]?.subjectName ?? "Select a subject"}</option>
                {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Momentum, Electrolysis, Circle Theorems"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">Note type</label>
              <div className="flex flex-wrap gap-2">
                {NOTE_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setNoteType(type.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      noteType === type.value ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#142f50] disabled:opacity-50"
            >
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate notes</>}
            </button>
          </section>

          <section>
            {isPending ? <GeneratingState /> : notes ? <NotesView notes={notes} /> : <EmptyState />}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function NotesView({ notes }: { notes: GeneratedNotes }) {
  const [copied, setCopied] = useState(false);
  const filename = `${notes.subject.name}-${notes.topic}-${notes.noteType}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const copy = async () => {
    await navigator.clipboard.writeText(notes.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([notes.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const print = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>${notes.topic} — ${notes.subject.name}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#0B1F3A}h1,h2,h3{color:#0B1F3A}code,pre{background:#f1f5f9;padding:2px 4px;border-radius:4px}</style></head><body><pre style="white-space:pre-wrap;font-family:inherit">${notes.markdown.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{notes.subject.name}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{notes.topic}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${notes.grounded ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
            {notes.grounded ? "Grounded in Cambridge sources" : "General knowledge"}
          </span>
        </div>
        <div className="flex gap-2">
          <IconButton onClick={copy} label={copied ? "Copied" : "Copy"} icon={copied ? Check : Copy} />
          <IconButton onClick={download} label="Markdown" icon={Download} />
          <IconButton onClick={print} label="Print / PDF" icon={Printer} />
        </div>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Markdown source={notes.markdown} />
      </article>

      {notes.sources.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-[#0B1F3A]">Sources</p>
          <ul className="space-y-1 text-xs text-slate-500">
            {notes.sources.map((source) => (
              <li key={source.index}>[S{source.index}] <span className="uppercase text-slate-400">{source.type.replace("_", " ")}</span> — {source.reference}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Lightweight markdown renderer: headings, bullets, task lists, table rows, bold. */
function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  return (
    <div className="space-y-2 text-sm leading-7 text-slate-700">
      {lines.map((raw, index) => {
        const line = raw.trimEnd();
        const value = line.trim();
        if (!value) return <div key={index} className="h-1" />;
        const heading = value.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
          const level = heading[1].length;
          const text = heading[2];
          return <p key={index} className={level <= 2 ? "pt-2 text-lg font-semibold text-[#0B1F3A]" : "pt-1 text-base font-semibold text-[#0B1F3A]"}>{inline(text)}</p>;
        }
        const task = value.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
        if (task) return <div key={index} className="flex gap-2"><span>{task[1].toLowerCase() === "x" ? "☑" : "☐"}</span><span>{inline(task[2])}</span></div>;
        if (/^[-*•]\s+/.test(value)) return <div key={index} className="flex gap-2 pl-2"><span className="text-teal-600">•</span><span>{inline(value.replace(/^[-*•]\s+/, ""))}</span></div>;
        if (/^\|.*\|$/.test(value)) return <div key={index} className="font-mono text-xs text-slate-600">{value}</div>;
        return <p key={index}>{inline(value)}</p>;
      })}
    </div>
  );
}

/** Render inline **bold** segments. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i} className="font-semibold text-[#0B1F3A]">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

function IconButton({ onClick, label, icon: Icon }: { onClick: () => void; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function GeneratingState() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      <p className="mt-3 text-sm text-slate-500">Searching Cambridge resources and writing your notes…</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
      <FileText className="h-8 w-8 text-slate-300" />
      <h2 className="mt-3 font-semibold text-[#0B1F3A]">Your notes will appear here</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">Pick a subject, enter a topic, choose a note type, and generate grounded revision material you can export.</p>
    </div>
  );
}
