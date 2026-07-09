import type { AiSource, Paper, Subject } from "@/api/types";
import { BookOpenCheck, Lightbulb, SlidersHorizontal, TrendingUp } from "lucide-react";

export function StudyContextPanel({ subject, paper, sources }: { subject: Subject; paper?: Paper; sources: AiSource[] }) {
  const topics = [...new Set(sources.flatMap(s => [s.subtopic, s.topic]).filter(Boolean))].slice(0, 5) as string[];
  const withScheme = sources.filter(s => s.answerText).length;

  return (
    <aside className="space-y-3">
      {/* Filter context */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
            <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          <h2 className="font-bold text-sm text-[#1E1B4B]">Active filters</h2>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            ["Year", paper?.year ?? "All"],
            ["Session", paper?.session?.replace("_", " ") ?? "All"],
            ["Paper", paper ? `P${paper.paperNumber}` : "All"],
            ["Variant", paper?.variant ?? "All"],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-2">
              <p className="font-bold uppercase tracking-widest text-[9px] text-slate-400">{label}</p>
              <p className="mt-0.5 font-semibold text-xs text-[#1E1B4B]">{value}</p>
            </div>
          ))}
        </div>
        {withScheme > 0 && (
          <div className="mt-2.5 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs">
            <span className="font-medium text-emerald-700">With marking scheme</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">{withScheme}</span>
          </div>
        )}
      </div>

      {/* Topics detected */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50">
            <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <h2 className="font-bold text-sm text-[#1E1B4B]">Topics detected</h2>
        </div>
        {topics.length > 0 ? (
          <div className="space-y-2.5">
            {topics.map((topic, i) => {
              const pct = Math.max(72, 96 - i * 5);
              return (
                <div key={topic}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="truncate pr-2 font-medium text-slate-700">{topic}</span>
                    <span className="shrink-0 text-slate-400">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
            Topics appear after a verified search.
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100">
            <Lightbulb className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          <h2 className="font-bold text-sm text-indigo-950">Quick actions</h2>
        </div>
        <div className="space-y-1.5">
          {["Explain like a teacher", "Give examiner-style answer", "Show marking scheme logic", "Find similar questions"].map(action => (
            <button
              key={action}
              className="flex w-full items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-left font-medium text-xs text-indigo-900 transition hover:bg-white hover:shadow-sm"
            >
              <BookOpenCheck className="h-3 w-3 shrink-0 text-indigo-500" />
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Subject info */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-4 text-xs shadow-sm">
        <p className="font-bold text-[#1E1B4B]">{subject.name}</p>
        <p className="mt-0.5 text-slate-400">{subject.code} · {subject.level.replace("_", " ")}</p>
        {sources.length > 0 && (
          <p className="mt-2 text-slate-500">
            <span className="font-semibold text-indigo-600">{sources.length}</span> verified sources
          </p>
        )}
      </div>
    </aside>
  );
}
