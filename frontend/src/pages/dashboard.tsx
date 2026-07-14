import { useEffect, useState } from "react";
import { getGetDashboardQueryKey, useGetDashboard, useListNotes, useListPapers, useListQuestions } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/context/auth-context";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  Lightbulb,
  NotebookText,
  Settings,
  Target,
  ScanText,
  Sparkles,
  ClipboardCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Link } from "wouter";

/* ─── Helpers ─── */

function useCountUp(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) { setCount(0); return; }
    const start = Date.now();
    const raf = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getTopPhysicsTopics(questions: Array<{ subjectName: string; topic: string }>) {
  const counts = new Map<string, number>();
  questions.filter((q) => /physics/i.test(q.subjectName)).forEach((q) => {
    const t = q.topic?.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function formatRelativeDate(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

/* ─── AI Tools config ─── */

const AI_TOOLS = [
  {
    title: "Question Solver",
    desc: "Photograph any exam question and get a full step-by-step solution.",
    href: "/question-solver",
    icon: ScanText,
    gradient: "from-violet-500 to-purple-600",
    softBg: "bg-violet-50",
    softBorder: "border-violet-100",
    iconColor: "text-violet-600",
    shadow: "hover:shadow-violet-100",
  },
  {
    title: "Notes Generator",
    desc: "Generate flashcards, summaries or last-minute checklists for any topic.",
    href: "/notes-generator",
    icon: Sparkles,
    gradient: "from-emerald-500 to-teal-500",
    softBg: "bg-emerald-50",
    softBorder: "border-emerald-100",
    iconColor: "text-emerald-600",
    shadow: "hover:shadow-emerald-100",
  },
  {
    title: "Paper Checker",
    desc: "Upload your answers and get them marked against the official scheme.",
    href: "/paper-checker",
    icon: ClipboardCheck,
    gradient: "from-orange-500 to-amber-500",
    softBg: "bg-orange-50",
    softBorder: "border-orange-100",
    iconColor: "text-orange-600",
    shadow: "hover:shadow-orange-100",
  },
  {
    title: "AI Tutor",
    desc: "Ask Cambridge exam questions and get grounded, cited answers instantly.",
    href: "/ai",
    icon: Bot,
    gradient: "from-sky-500 to-blue-600",
    softBg: "bg-sky-50",
    softBorder: "border-sky-100",
    iconColor: "text-sky-600",
    shadow: "hover:shadow-sky-100",
  },
] as const;

/* ─── Color maps ─── */

const STAT_COLORS: Record<string, { bg: string; iconBg: string; icon: string; num: string }> = {
  indigo:  { bg: "bg-indigo-50",  iconBg: "bg-indigo-100",  icon: "text-indigo-600",  num: "text-indigo-700" },
  emerald: { bg: "bg-emerald-50", iconBg: "bg-emerald-100", icon: "text-emerald-600", num: "text-emerald-700" },
  violet:  { bg: "bg-violet-50",  iconBg: "bg-violet-100",  icon: "text-violet-600",  num: "text-violet-700" },
  orange:  { bg: "bg-orange-50",  iconBg: "bg-orange-100",  icon: "text-orange-600",  num: "text-orange-700" },
};

/* ─── Main Component ─── */

export default function Dashboard() {
  const { user } = useAuth();
  const { data: dashboard, isLoading, isError, error } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });
  const { data: questions = [] } = useListQuestions({});
  const { data: papers    = [] } = useListPapers({});
  const { data: notes     = [] } = useListNotes({});

  if (isLoading) return <AppLayout><LoadingSkeleton /></AppLayout>;
  if (isError)   return <AppLayout><ErrorState error={error} /></AppLayout>;
  if (!dashboard) return null;

  const selectedSubjects = dashboard.subjectProgress;
  const continueSubject  = [...selectedSubjects].sort((a, b) => {
    if (!a.lastStudied) return 1;
    if (!b.lastStudied) return -1;
    return new Date(b.lastStudied).getTime() - new Date(a.lastStudied).getTime();
  })[0];
  const physicsTopics = getTopPhysicsTopics(questions);

  const STATS = [
    { label: "Subjects",   value: dashboard.subjectsEnrolled, icon: BookOpen,    color: "indigo"  },
    { label: "Questions",  value: questions.length,           icon: Target,      color: "emerald" },
    { label: "Papers",     value: papers.length,              icon: FileText,    color: "violet"  },
    { label: "Notes",      value: notes.length,               icon: NotebookText,color: "orange"  },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">

        {/* ── 1. Welcome Banner ── */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-7 text-white shadow-2xl shadow-indigo-500/25 animate-fade-up sm:p-8">
          {/* Background decorations */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/[0.07] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-purple-500/[0.15] blur-3xl" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              {/* Badges */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/20 px-3 py-1 text-xs font-semibold text-white/90">
                  <Zap className="h-3 w-3 text-yellow-300" />
                  {user?.level === "O_LEVEL" ? "O Level" : user?.level === "A_LEVEL" ? "A Level" : "Cambridge"} Student
                </span>
                {dashboard.streakDays > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-400/20 border border-orange-300/30 px-3 py-1 text-xs font-bold text-orange-200">
                    <Flame className="h-3 w-3 text-orange-300 fill-orange-300" />
                    {dashboard.streakDays} day streak 🔥
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {getGreeting()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}! 👋
              </h1>
              <p className="mt-2 text-white/60 text-sm max-w-lg">
                {selectedSubjects.length > 0
                  ? `You have ${selectedSubjects.length} subject${selectedSubjects.length !== 1 ? "s" : ""} in your workspace. Keep going — every question gets you closer.`
                  : "Start by choosing your Cambridge subjects below."
                }
              </p>

              {/* CTA buttons */}
              <div className="mt-5 flex flex-wrap gap-2.5">
                {continueSubject && (
                  <Link href={`/subject/${continueSubject.subjectId}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-indigo-700 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl">
                    Continue studying <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
                <Link href="/onboarding"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20">
                  Manage subjects
                </Link>
              </div>
            </div>

            {/* Subject progress strip (top-right) */}
            {continueSubject && (
              <div className="lg:w-72 shrink-0">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/50">Currently studying</p>
                <div className="space-y-2">
                  {selectedSubjects.slice(0, 3).map((s) => (
                    <div key={s.subjectId} className="flex items-center gap-3 rounded-xl bg-white/10 border border-white/15 px-4 py-2.5 backdrop-blur-sm">
                      <div className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm"
                        style={{ background: s.subjectColor || "rgba(255,255,255,0.25)" }}>
                        {s.subjectName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-white truncate">{s.subjectName}</span>
                          <span className="text-[10px] font-bold text-white/70 ml-2 shrink-0">{s.percentComplete}%</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/20">
                          <div className="h-full rounded-full bg-white/80 animate-progress" style={{ width: `${Math.min(s.percentComplete, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ── 2. AI Tools ── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">AI-Powered Tools</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {AI_TOOLS.map((tool, i) => (
              <Link
                key={tool.href}
                href={tool.href}
                className={`group relative overflow-hidden rounded-2xl border ${tool.softBorder} bg-white p-5 shadow-sm transition-all duration-250 hover:-translate-y-1.5 hover:shadow-lg ${tool.shadow} animate-fade-up`}
                style={{ animationDelay: `${i * 55}ms` }}
              >
                {/* Icon */}
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.gradient} text-white shadow-md`}>
                  <tool.icon className="h-6 w-6" />
                </div>
                <p className="font-bold text-[#1E1B4B] text-sm leading-snug mb-1.5">{tool.title}</p>
                <p className="text-xs text-slate-400 leading-5 line-clamp-2">{tool.desc}</p>
                {/* Arrow badge on hover */}
                <div className={`absolute right-4 bottom-4 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${tool.gradient} text-white opacity-0 scale-75 shadow-sm transition-all duration-200 group-hover:opacity-100 group-hover:scale-100`}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 3. Continue Learning + Right column ── */}
        <section className="grid gap-5 xl:grid-cols-[1fr_320px]">

          {/* Continue Learning — subject list */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm animate-fade-up stagger-2">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Continue learning</p>
                <h2 className="mt-0.5 text-lg font-bold text-[#1E1B4B]">Your subjects</h2>
              </div>
              <Link href="/subjects" className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {selectedSubjects.length > 0 ? (
              <div className="space-y-3">
                {selectedSubjects.map((s, i) => (
                  <Link
                    key={s.subjectId}
                    href={`/subject/${s.subjectId}`}
                    className="group flex items-center gap-4 rounded-2xl border border-slate-100 p-4 transition-all hover:border-indigo-100 hover:bg-indigo-50/40 hover:-translate-y-0.5 hover:shadow-sm animate-fade-up"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {/* Subject badge */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-md"
                      style={{ background: s.subjectColor || "#6366F1" }}>
                      {s.subjectName.charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-bold text-[#1E1B4B] truncate">{s.subjectName}</h3>
                        <span className="ml-2 shrink-0 text-xs font-bold text-indigo-600">{s.percentComplete}%</span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full animate-progress rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                          style={{ width: `${Math.min(s.percentComplete, 100)}%` }} />
                      </div>
                      {/* Mini stats */}
                      <div className="mt-2 flex gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Target className="h-3 w-3" />{s.questionsAttempted} questions</span>
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{s.papersCompleted} papers</span>
                        <span className="flex items-center gap-1"><NotebookText className="h-3 w-3" />{s.notesRead} notes</span>
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:text-indigo-400 group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
                  <BookOpen className="h-8 w-8 text-indigo-400" />
                </div>
                <p className="font-bold text-[#1E1B4B]">No subjects yet</p>
                <p className="mt-1 text-sm text-slate-400 mb-5">Choose your Cambridge subjects to get started</p>
                <Link href="/onboarding" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-indigo-700 transition-colors">
                  Choose subjects <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Mini Stats 2×2 */}
            <div className="grid grid-cols-2 gap-3">
              {STATS.map((stat, i) => (
                <MiniStatCard key={stat.label} stat={stat} delay={i * 50} />
              ))}
            </div>

            {/* Upcoming Exams */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                  <CalendarDays className="h-3.5 w-3.5 text-indigo-600" />
                </div>
                <h3 className="text-sm font-bold text-[#1E1B4B]">Upcoming Exams</h3>
              </div>
              {dashboard.upcomingExams.length ? (
                <div className="space-y-2">
                  {dashboard.upcomingExams.slice(0, 3).map((exam) => (
                    <div key={exam.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-sm">
                        <p className="text-base font-bold text-white leading-none">{exam.daysUntil}</p>
                        <p className="text-[9px] font-semibold uppercase text-indigo-200">days</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1E1B4B] truncate">{exam.subjectName}</p>
                        <p className="text-xs text-slate-400">Paper {exam.paperNumber} · {formatDate(exam.examDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-5 text-center">
                  <CalendarDays className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-400">No upcoming exams</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── 4. Recent Activity + Top Topics ── */}
        <section className="grid gap-5 lg:grid-cols-2">
          {/* Recent Activity */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm animate-fade-up stagger-3">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                <Clock3 className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <h3 className="text-sm font-bold text-[#1E1B4B]">Recent Activity</h3>
            </div>
            {dashboard.recentActivity.length ? (
              <div className="space-y-0.5">
                {dashboard.recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-[#1E1B4B] leading-5">{activity.description}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{activity.subjectName} · {formatRelativeDate(activity.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Clock3 className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Your study activity will appear here.</p>
              </div>
            )}
          </div>

          {/* Top Topics */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm animate-fade-up stagger-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                <Lightbulb className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <h3 className="text-sm font-bold text-[#1E1B4B]">Top Topics in Physics</h3>
            </div>
            {physicsTopics.length ? (
              <div className="space-y-4">
                {physicsTopics.map(([topic, count], index) => (
                  <div key={topic}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-[#1E1B4B] truncate">{topic}</span>
                      <span className="ml-2 shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600">{count} q</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full animate-progress rounded-full"
                        style={{
                          width: `${Math.max(14, 100 - index * 17)}%`,
                          background: "linear-gradient(90deg, #6366F1, #8B5CF6)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Lightbulb className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Physics topics appear when questions are added.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

/* ─── Mini Stat Card ─── */

function MiniStatCard({ stat, delay }: {
  stat: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string };
  delay: number;
}) {
  const count = useCountUp(stat.value);
  const c = STAT_COLORS[stat.color] ?? STAT_COLORS.indigo;
  return (
    <article
      className={`rounded-2xl ${c.bg} p-4 animate-fade-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-xl ${c.iconBg}`}>
        <stat.icon className={`h-4 w-4 ${c.icon}`} />
      </div>
      <p className={`text-2xl font-bold ${c.num}`}>{count}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{stat.label}</p>
    </article>
  );
}

/* ─── Skeleton loading ─── */

function LoadingSkeleton() {
  return (
    <div className="space-y-5 pb-8 animate-fade-in">
      <div className="skeleton h-52 rounded-3xl" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="skeleton h-64 rounded-2xl" />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
          <div className="skeleton h-32 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/* ─── Error state ─── */

/**
 * Supabase/Postgrest errors are plain objects ({message, details, hint, code}),
 * NOT `instanceof Error` — the old `error instanceof Error` check silently
 * swallowed every real Supabase error and showed a generic "connect Supabase"
 * fallback instead, hiding the actual cause. Extract a message from whatever
 * shape the error actually is.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint].filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length) return parts.join(" — ");
    if (record.code) return `Error code: ${String(record.code)}`;
  }
  return "An unknown error occurred loading your workspace. Please try refreshing.";
}

function ErrorState({ error }: { error: unknown }) {
  if (import.meta.env.DEV) console.error("[Dashboard] load failed:", error);
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
        <Settings className="h-7 w-7 text-red-400" />
      </div>
      <h2 className="text-lg font-bold text-[#1E1B4B]">Dashboard not ready</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-400">{describeError(error)}</p>
    </div>
  );
}
