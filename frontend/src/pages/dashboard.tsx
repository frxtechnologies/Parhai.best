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
  Lightbulb,
  NotebookText,
  Settings,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Link } from "wouter";

function useCountUp(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) return;
    const start = Date.now();
    const raf = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(ease * target));
      if (p < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

const tutorPrompts = [
  "Explain a difficult topic",
  "Create a revision plan",
  "Find past paper questions",
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: dashboard, isLoading, isError, error } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });
  const { data: questions = [] } = useListQuestions({});
  const { data: papers = [] } = useListPapers({});
  const { data: notes = [] } = useListNotes({});

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 pb-8">
          <div className="skeleton h-44 rounded-2xl" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
          </div>
          <div className="skeleton h-56 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (isError) {
    return (
      <AppLayout>
        <EmptyPanel icon={Settings} title="Dashboard is not ready" body={error instanceof Error ? error.message : "Connect Supabase and complete onboarding to load your workspace."} />
      </AppLayout>
    );
  }

  if (!dashboard) return null;

  const selectedSubjects = dashboard.subjectProgress;
  const continueSubject = [...selectedSubjects].sort((a, b) => {
    if (!a.lastStudied) return 1;
    if (!b.lastStudied) return -1;
    return new Date(b.lastStudied).getTime() - new Date(a.lastStudied).getTime();
  })[0];
  const physicsTopics = getTopPhysicsTopics(questions);

  const stats = [
    { label: "Selected subjects",   value: dashboard.subjectsEnrolled, icon: BookOpen,    detail: "Active study plan",    color: "from-blue-500 to-indigo-500",   glow: "rgba(99,102,241,0.15)" },
    { label: "Available questions",  value: questions.length,           icon: Target,      detail: "Ready for practice",   color: "from-cyan-500 to-sky-500",     glow: "rgba(6,182,212,0.15)" },
    { label: "Papers uploaded",      value: papers.length,              icon: FileText,    detail: "Across your subjects", color: "from-violet-500 to-purple-500", glow: "rgba(139,92,246,0.15)" },
    { label: "Notes available",      value: notes.length,               icon: NotebookText,detail: "Revision resources",   color: "from-teal-500 to-emerald-500",  glow: "rgba(20,184,166,0.15)" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 pb-10">

        {/* Welcome Hero */}
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B1F3A] via-[#0D2B52] to-[#093050] p-6 text-white shadow-xl shadow-[#0B1F3A]/25 sm:p-8 animate-fade-up">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/[0.12] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-1/3 h-56 w-56 rounded-full bg-teal-400/[0.10] blur-3xl" />
          <div className="pointer-events-none absolute top-6 left-1/2 h-32 w-32 rounded-full bg-indigo-400/[0.08] blur-2xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300 mb-4">
                <Zap className="h-3 w-3" />
                Student dashboard
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                Pick up where you left off, review your subjects, and prepare for your Cambridge exams.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row shrink-0">
              {continueSubject && (
                <Link
                  href={`/subject/${continueSubject.subjectId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-500/30"
                >
                  Continue studying <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/15"
              >
                Manage subjects
              </Link>
            </div>
          </div>
        </header>

        {/* Stat Cards */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat, i) => (
            <StatCard key={stat.label} stat={stat} delay={i * 60} />
          ))}
        </section>

        {/* Continue + AI Tutor */}
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel className="animate-fade-up stagger-2">
            <SectionHeading
              eyebrow="Continue learning"
              title={continueSubject?.subjectName ?? "Choose your first subject"}
              action={continueSubject ? <Link href={`/subject/${continueSubject.subjectId}`} className="gradient-text text-sm font-semibold flex items-center gap-1 hover:gap-2 transition-all">Open <ArrowRight className="h-3.5 w-3.5" /></Link> : undefined}
            />
            {continueSubject ? (
              <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-xl text-lg font-bold text-white shadow-lg"
                  style={{ background: continueSubject.subjectColor || "#0B1F3A" }}
                >
                  {continueSubject.subjectName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-[#0B1F3A]">Course progress</span>
                    <span className="font-bold gradient-text">{continueSubject.percentComplete}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 animate-progress shadow-sm shadow-cyan-500/30"
                      style={{ width: `${Math.min(continueSubject.percentComplete, 100)}%` }}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-teal-500" />{continueSubject.questionsAttempted} questions</span>
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3 text-blue-500" />{continueSubject.papersCompleted} papers</span>
                    <span className="flex items-center gap-1"><NotebookText className="h-3 w-3 text-violet-500" />{continueSubject.notesRead} notes</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Select subjects to create your focused learning workspace.</p>
            )}
          </Panel>

          {/* AI Tutor Panel */}
          <div className="relative overflow-hidden rounded-xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50/80 to-teal-50/50 p-5 shadow-sm animate-fade-up stagger-3">
            <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-teal-400/10 blur-2xl pointer-events-none" />
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/25">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600">AI Tutor</p>
                <h2 className="font-semibold text-[#0B1F3A] leading-tight">Ask your Cambridge teacher</h2>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {tutorPrompts.map((prompt) =>
                continueSubject ? (
                  <Link
                    key={prompt}
                    href={`/subject/${continueSubject.subjectId}/ai`}
                    className="flex items-center justify-between rounded-xl border border-cyan-100 bg-white/80 px-3 py-2.5 text-sm text-slate-600 transition-all hover:border-cyan-300 hover:shadow-sm hover:text-[#0B1F3A] hover:-translate-y-0.5"
                  >
                    {prompt}
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Link>
                ) : (
                  <div key={prompt} className="rounded-xl border border-cyan-100 bg-white/60 px-3 py-2.5 text-sm text-slate-400">
                    {prompt}
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* Subject Progress */}
        <Panel className="animate-fade-up stagger-4">
          <SectionHeading
            eyebrow="Your courses"
            title="Subject progress"
            action={
              <Link href="/subjects" className="inline-flex items-center gap-1 text-sm font-semibold gradient-text hover:gap-2 transition-all">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          {selectedSubjects.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedSubjects.map((subject, i) => (
                <Link
                  key={subject.subjectId}
                  href={`/subject/${subject.subjectId}`}
                  className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition-all duration-250 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-md"
                        style={{ background: subject.subjectColor || "#0B1F3A" }}
                      >
                        {subject.subjectName.charAt(0)}
                      </span>
                      <div>
                        <h3 className="font-semibold text-[#0B1F3A] leading-tight">{subject.subjectName}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{subject.hoursStudied} hours studied</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition-all group-hover:text-cyan-500 group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Progress</span>
                    <span className="font-bold text-[#0B1F3A]">{subject.percentComplete}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 animate-progress"
                      style={{ width: `${Math.min(subject.percentComplete, 100)}%` }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 text-center">
                    <MiniMetric label="Questions" value={subject.questionsAttempted} />
                    <MiniMetric label="Papers" value={subject.papersCompleted} />
                    <MiniMetric label="Notes" value={subject.notesRead} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel icon={BookOpen} title="No subjects selected" body="Choose O Level or A Level subjects to begin." />
          )}
        </Panel>

        {/* Bottom row */}
        <section className="grid gap-5 lg:grid-cols-3">
          <Panel className="animate-fade-up stagger-5">
            <SectionHeading eyebrow="Your timeline" title="Recent activity" />
            {dashboard.recentActivity.length ? (
              <div className="mt-4 divide-y divide-slate-100/80">
                {dashboard.recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex gap-3 py-3 first:pt-0">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-sm leading-5 text-slate-600">{activity.description}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{activity.subjectName} · {formatRelativeDate(activity.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyText icon={Clock3} text="Your study activity will appear here." />}
          </Panel>

          <Panel className="animate-fade-up stagger-6">
            <SectionHeading eyebrow="Plan ahead" title="Upcoming exams" />
            {dashboard.upcomingExams.length ? (
              <div className="mt-4 space-y-2.5">
                {dashboard.upcomingExams.slice(0, 4).map((exam) => (
                  <div key={exam.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 hover:border-slate-200 transition-colors">
                    <div className="min-w-12 rounded-lg bg-gradient-to-br from-[#0B1F3A] to-[#0D3060] px-2 py-1.5 text-center shadow-sm">
                      <p className="text-lg font-bold text-white leading-none">{exam.daysUntil}</p>
                      <p className="text-[10px] uppercase text-slate-400 mt-0.5">days</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0B1F3A]">{exam.subjectName} Paper {exam.paperNumber}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatDate(exam.examDate)} · {exam.session.replace("_", "/")}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyText icon={CalendarDays} text="No upcoming exams added yet." />}
          </Panel>

          <Panel className="animate-fade-up stagger-7">
            <SectionHeading eyebrow="Question bank" title="Top topics in Physics" />
            {physicsTopics.length ? (
              <div className="mt-4 space-y-4">
                {physicsTopics.map(([topic, count], index) => (
                  <div key={topic}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-slate-700 truncate">{topic}</span>
                      <span className="text-xs text-slate-400 shrink-0 ml-2">{count}q</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#0B1F3A] to-cyan-600 animate-progress"
                        style={{ width: `${Math.max(14, 100 - index * 17)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyText icon={Lightbulb} text="Physics topics appear when questions are available." />}
          </Panel>
        </section>
      </div>
    </AppLayout>
  );
}

function StatCard({ stat, delay }: { stat: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; detail: string; color: string; glow: string }; delay: number }) {
  const count = useCountUp(stat.value, 900 + delay);
  return (
    <article
      className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm card-lift animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top accent bar */}
      <div className={`absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r ${stat.color} rounded-t-xl`} />
      <div className="flex items-start justify-between gap-4 mt-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stat.label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[#0B1F3A]">{count}</p>
          <p className="mt-1 text-xs text-slate-400">{stat.detail}</p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${stat.color} text-white shadow-lg`}
          style={{ boxShadow: `0 4px 14px ${stat.glow}` }}
        >
          <stat.icon className="h-5 w-5" />
        </span>
      </div>
      <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full opacity-[0.04]" style={{ background: stat.glow }} />
    </article>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{eyebrow}</p>
        <h2 className="mt-0.5 text-lg font-bold text-[#0B1F3A]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-1">
      <p className="text-sm font-bold text-[#0B1F3A]">{value}</p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

function EmptyText({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="mt-5 flex flex-col items-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
      <Icon className="h-5 w-5 text-slate-300" />
      <p className="mt-2 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function EmptyPanel({ body, icon: Icon, title }: { body: string; icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0B1F3A] shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="mt-3 font-semibold text-[#0B1F3A]">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p>
    </div>
  );
}

function getTopPhysicsTopics(questions: Array<{ subjectName: string; topic: string }>) {
  const counts = new Map<string, number>();
  questions
    .filter((q) => /physics/i.test(q.subjectName))
    .forEach((q) => {
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
  return formatDate(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
