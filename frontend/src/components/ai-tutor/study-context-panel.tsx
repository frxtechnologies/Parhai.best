import type { AiSource, Paper, Subject } from "@/api/types";
import { BookOpenCheck, Filter, Lightbulb, SlidersHorizontal } from "lucide-react";

export function StudyContextPanel({ subject, paper, sources }: { subject: Subject; paper?: Paper; sources: AiSource[] }) {
  const topics = [...new Set(sources.flatMap((source) => [source.subtopic, source.topic]).filter(Boolean))].slice(0, 4) as string[];
  return <aside className="space-y-4">
    <section className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,.04)]">
      <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-emerald-600" /><h2 className="font-semibold text-[#0B1F3A]">Refine results</h2></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {[["Year", paper?.year ?? "All"], ["Session", paper?.session?.replace("_", " ") ?? "All"], ["Paper", paper ? `Paper ${paper.paperNumber}` : "All"], ["Variant", paper?.variant ?? "All"]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 font-semibold text-slate-700">{value}</p></div>)}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 text-xs"><span>With marking scheme</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">{sources.filter((source) => source.answerText).length}</span></div>
    </section>

    <section className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,.04)]">
      <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-blue-600" /><h2 className="font-semibold text-[#0B1F3A]">Topics detected</h2></div>
      <div className="mt-4 space-y-3">{topics.map((topic, index) => { const confidence = Math.max(80, 96 - index * 5); return <div key={topic}><div className="mb-1 flex justify-between text-xs"><span className="font-medium text-slate-700">{topic}</span><span className="text-slate-400">{confidence}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${confidence}%` }} /></div></div>; })}{!topics.length && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">Topics will appear after a verified search.</p>}</div>
      <a href="/admin/topic-maps" className="mt-4 inline-block text-xs font-semibold text-emerald-700">View full topic map →</a>
    </section>

    <section className="rounded-[20px] border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
      <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-violet-600" /><h2 className="font-semibold text-violet-950">Need help?</h2></div>
      <div className="mt-3 space-y-1.5">{["Explain like a teacher", "Give examiner-style answer", "Show marking scheme logic", "Find similar questions"].map((action) => <button key={action} className="flex w-full items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-left text-xs font-medium text-violet-900 transition hover:bg-white"><BookOpenCheck className="h-3.5 w-3.5 text-violet-500" />{action}</button>)}</div>
    </section>

    <section className="rounded-[20px] border border-slate-200/80 bg-white p-4 text-xs text-slate-500"><p className="font-semibold text-[#0B1F3A]">{subject.name} {subject.code}</p><p className="mt-1">{subject.level.replace("_", " ")} · {sources.length} verified sources</p></section>
  </aside>;
}
