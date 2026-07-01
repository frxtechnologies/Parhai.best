import { getGetDashboardQueryKey, useGetDashboard, useListNotes, useListPapers, useListQuestions } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { SubjectMark } from "@/components/subject-mark";
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
} from "lucide-react";
import { Link } from "wouter";

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
    return <AppLayout><div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">Loading your workspace…</div></AppLayout>;
  }

  if (isError) {
    return <AppLayout><EmptyPanel icon={Settings} title="Dashboard is not ready" body={error instanceof Error ? error.message : "Connect Supabase and complete onboarding to load your workspace."} /></AppLayout>;
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
    { label: "Selected subjects", value: dashboard.subjectsEnrolled, icon: BookOpen, detail: "Your active study plan" },
    { label: "Available questions", value: questions.length, icon: Target, detail: "Ready for practice" },
    { label: "Papers uploaded", value: papers.length, icon: FileText, detail: "Across your subjects" },
    { label: "Notes available", value: notes.length, icon: NotebookText, detail: "Revision resources" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 pb-8">
        <header className="relative isolate overflow-hidden rounded-[28px] bg-[#0B1F3A] p-6 text-white shadow-[0_24px_60px_rgba(11,31,58,.18)] sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div className="absolute -right-24 -top-32 -z-10 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute bottom-0 right-[30%] -z-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-200">Your study command centre</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Pick up where you left off, review your subjects, and prepare for your next Cambridge exam.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row lg:mt-0">
            {continueSubject && (
              <Link href={`/subject/${continueSubject.subjectId}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#0B1F3A] shadow-lg shadow-black/10 transition hover:-translate-y-0.5">
                Continue studying <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <Link href="/onboarding" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">
              Manage subjects
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="group rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,.08)] sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 sm:text-sm">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0B1F3A] sm:text-3xl">{stat.value}</p>
                  <p className="mt-1 hidden text-xs text-slate-400 sm:block">{stat.detail}</p>
                </div>
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 transition group-hover:scale-105 sm:flex">
                  <stat.icon className="h-5 w-5" />
                </span>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,.8fr)]">
          <Panel>
            <SectionHeading eyebrow="Continue learning" title={continueSubject?.subjectName ?? "Choose your first subject"} action={continueSubject ? <Link href={`/subject/${continueSubject.subjectId}`} className="text-sm font-semibold text-teal-700">Open subject</Link> : undefined} />
            {continueSubject ? (
              <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
                <SubjectMark name={continueSubject.subjectName} size="lg"/>
                <div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-[#0B1F3A]">Course progress</span>
                    <span className="font-semibold text-[#0B1F3A]">{continueSubject.percentComplete}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(continueSubject.percentComplete, 100)}%` }} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                    <span>{continueSubject.questionsAttempted} questions attempted</span>
                    <span>{continueSubject.papersCompleted} papers completed</span>
                    <span>{continueSubject.notesRead} notes read</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Select subjects to create your focused learning workspace.</p>
            )}
          </Panel>

          <Panel className="border-teal-100 bg-teal-50/40">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm"><Bot className="h-5 w-5" /></span>
              <div><p className="text-xs font-semibold uppercase tracking-wider text-teal-700">AI Tutor</p><h2 className="font-semibold text-[#0B1F3A]">Ask your Cambridge teacher</h2></div>
            </div>
            <div className="mt-4 space-y-2">
              {tutorPrompts.map((prompt) => continueSubject ? (
                <Link key={prompt} href={`/subject/${continueSubject.subjectId}/ai`} className="flex items-center justify-between rounded-lg border border-teal-100 bg-white px-3 py-2.5 text-sm text-slate-600 transition hover:border-teal-300 hover:text-[#0B1F3A]">
                  {prompt}<ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              ) : <div key={prompt} className="rounded-lg border border-teal-100 bg-white px-3 py-2.5 text-sm text-slate-400">{prompt}</div>)}
            </div>
          </Panel>
        </section>

        <Panel>
          <SectionHeading eyebrow="Your courses" title="Subject progress" action={<Link href="/subjects" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700">View all <ArrowRight className="h-4 w-4" /></Link>} />
          {selectedSubjects.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedSubjects.map((subject) => (
                <Link key={subject.subjectId} href={`/subject/${subject.subjectId}`} className="group rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <SubjectMark name={subject.subjectName} size="sm"/>
                      <div><h3 className="font-semibold text-[#0B1F3A]">{subject.subjectName}</h3><p className="text-xs text-slate-400">{subject.hoursStudied} hours studied</p></div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-teal-700" />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs"><span className="text-slate-500">Progress</span><span className="font-semibold text-[#0B1F3A]">{subject.percentComplete}%</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(subject.percentComplete, 100)}%` }} /></div>
                  <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 text-center">
                    <MiniMetric label="Questions" value={subject.questionsAttempted} />
                    <MiniMetric label="Papers" value={subject.papersCompleted} />
                    <MiniMetric label="Notes" value={subject.notesRead} />
                  </div>
                </Link>
              ))}
            </div>
          ) : <EmptyPanel icon={BookOpen} title="No subjects selected" body="Choose O Level or A Level subjects to begin." />}
        </Panel>

        <section className="grid gap-5 lg:grid-cols-3">
          <Panel>
            <SectionHeading eyebrow="Your timeline" title="Recent activity" />
            {dashboard.recentActivity.length ? (
              <div className="mt-4 divide-y divide-slate-100">
                {dashboard.recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex gap-3 py-3 first:pt-0">
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                    <div><p className="text-sm leading-5 text-slate-600">{activity.description}</p><p className="mt-1 text-xs text-slate-400">{activity.subjectName} · {formatRelativeDate(activity.createdAt)}</p></div>
                  </div>
                ))}
              </div>
            ) : <EmptyText icon={Clock3} text="Your study activity will appear here." />}
          </Panel>

          <Panel>
            <SectionHeading eyebrow="Plan ahead" title="Upcoming tasks" />
            {dashboard.upcomingExams.length ? (
              <div className="mt-4 space-y-3">
                {dashboard.upcomingExams.slice(0, 4).map((exam) => (
                  <div key={exam.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-12 rounded-lg bg-slate-50 px-2 py-1.5 text-center"><p className="text-lg font-semibold text-[#0B1F3A]">{exam.daysUntil}</p><p className="text-[10px] uppercase text-slate-400">days</p></div>
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-[#0B1F3A]">{exam.subjectName} Paper {exam.paperNumber}</p><p className="mt-0.5 text-xs text-slate-400">{formatDate(exam.examDate)} · {exam.session.replace("_", "/")}</p></div>
                  </div>
                ))}
              </div>
            ) : <EmptyText icon={CalendarDays} text="No upcoming exams or tasks added yet." />}
          </Panel>

          <Panel>
            <SectionHeading eyebrow="Question bank" title="Top topics in Physics" />
            {physicsTopics.length ? (
              <div className="mt-4 space-y-4">
                {physicsTopics.map(([topic, count], index) => (
                  <div key={topic}>
                    <div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-600">{topic}</span><span className="text-xs text-slate-400">{count} questions</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0B1F3A]" style={{ width: `${Math.max(14, 100 - index * 17)}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : <EmptyText icon={Lightbulb} text="Physics topics will appear when questions are available." />}
          </Panel>
        </section>
      </div>
    </AppLayout>
  );
}

function getTopPhysicsTopics(questions: Array<{ subjectName: string; topic: string }>) {
  const counts = new Map<string, number>();
  questions.filter((question) => /physics/i.test(question.subjectName)).forEach((question) => {
    const topic = question.topic?.trim();
    if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/80 bg-white/90 p-5 shadow-[0_8px_30px_rgba(15,23,42,.05)] ring-1 ring-slate-200/60 sm:p-6 ${className}`}>{children}</section>;
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-[#0B1F3A]">{title}</h2></div>{action}</div>;
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div className="px-1"><p className="text-sm font-semibold text-[#0B1F3A]">{value}</p><p className="text-[10px] text-slate-400">{label}</p></div>;
}

function EmptyText({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return <div className="mt-5 flex flex-col items-center rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center"><Icon className="h-5 w-5 text-slate-300" /><p className="mt-2 text-sm text-slate-400">{text}</p></div>;
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function EmptyPanel({ body, icon: Icon, title }: { body: string; icon: React.ComponentType<{ className?: string }>; title: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#0B1F3A] shadow-sm"><Icon className="h-5 w-5" /></div><h2 className="mt-3 font-semibold text-[#0B1F3A]">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p></div>;
}
