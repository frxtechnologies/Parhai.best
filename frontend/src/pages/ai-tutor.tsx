import { AppLayout } from "@/components/layout/app-layout";
import { useListSubjects } from "@/api/client";
import { useAuth } from "@/context/auth-context";
import { Bot, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "wouter";

const COLORS = [
  { from: "#6366F1", to: "#8B5CF6", glow: "rgba(99,102,241,0.22)" },
  { from: "#10B981", to: "#14B8A6", glow: "rgba(16,185,129,0.22)" },
  { from: "#F97316", to: "#FBBF24", glow: "rgba(249,115,22,0.22)" },
  { from: "#0EA5E9", to: "#3B82F6", glow: "rgba(14,165,233,0.22)" },
  { from: "#8B5CF6", to: "#A855F7", glow: "rgba(139,92,246,0.22)" },
  { from: "#F43F5E", to: "#EC4899", glow: "rgba(244,63,94,0.22)" },
  { from: "#22C55E", to: "#16A34A", glow: "rgba(34,197,94,0.22)" },
  { from: "#6366F1", to: "#06B6D4", glow: "rgba(99,102,241,0.22)" },
];

export default function AiTutor() {
  const { user } = useAuth();
  const { data: subjects = [], isLoading } = useListSubjects(user?.level ? { level: user.level } : undefined);
  const selected = subjects.filter(s => user?.subjectIds.includes(s.id));
  const visible = selected.length > 0 ? selected : subjects;

  return (
    <AppLayout>
      <div className="space-y-8 pb-8">
        {/* Hero banner */}
        <div className="relative overflow-hidden rounded-3xl p-8 md:p-10" style={{ background: "linear-gradient(135deg, #0C0A1E 0%, #1a1640 100%)" }}>
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
          </div>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
          />
          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-4 py-2">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300">Subject-specific AI · Cambridge grounded</span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">Choose your AI Tutor</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
              Each tutor answers from real Cambridge past papers, marking schemes, and examiner reports — not hallucinations.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 text-xs text-slate-500">
              {["Verified sources only", "Past paper grounded", "Examiner-style answers", "Instant topic search"].map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Subject grid */}
        <div>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
              {selected.length > 0 ? "Your subjects" : "All subjects"}
            </h2>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
              {visible.length} available
            </span>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
              <Bot className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="font-semibold text-slate-500">No subjects yet</p>
              <p className="mt-1 text-sm text-slate-400">Select subjects during onboarding to access AI tutors.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((subject, idx) => {
                const c = COLORS[idx % COLORS.length];
                return (
                  <Link key={subject.id} href={`/subject/${subject.id}/ai`}>
                    <div className="group relative h-full cursor-pointer overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-xl">
                      {/* Top gradient line on hover */}
                      <div
                        className="absolute inset-x-0 top-0 h-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        style={{ background: `linear-gradient(to right, ${c.from}, ${c.to})` }}
                      />
                      {/* Glow orb on hover */}
                      <div
                        className="absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                        style={{ background: c.glow }}
                      />

                      <div className="mb-4 flex items-start justify-between">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-lg"
                          style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})`, boxShadow: `0 6px 20px ${c.glow}` }}
                        >
                          <Bot className="h-5 w-5" />
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                          {subject.level === "O_LEVEL" ? "O Level" : "A Level"}
                        </span>
                      </div>

                      <h2 className="text-lg font-bold leading-snug" style={{ color: "var(--foreground)" }}>{subject.name}</h2>
                      <p className="mt-0.5 text-sm font-medium text-slate-400">{subject.code}</p>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-xs text-slate-400">Ask anything from past papers</span>
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full text-white opacity-0 transition-all duration-200 group-hover:opacity-100"
                          style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
