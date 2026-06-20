import { getGetDashboardQueryKey, useGetDashboard } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/context/auth-context";
import { ArrowRight, BookOpen, FileText, LineChart, LogOut, Settings, Sparkles, Target } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { logout, user } = useAuth();
  const { data: dashboard, isLoading, isError, error } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-[50vh] items-center justify-center text-sm text-gray-500">Loading dashboard...</div>
      </AppLayout>
    );
  }

  if (isError) {
    return (
      <AppLayout>
        <EmptyPanel
          icon={Settings}
          title="Dashboard is not ready"
          body={error instanceof Error ? error.message : "Connect Supabase and complete onboarding to load your workspace."}
        />
      </AppLayout>
    );
  }

  if (!dashboard) return null;

  const selectedSubjects = dashboard.subjectProgress;
  const uploadedPapers = selectedSubjects.reduce((sum, subject) => sum + subject.papersCompleted, 0);
  const nextSubject = selectedSubjects[0];

  const stats = [
    { label: "Selected subjects", value: dashboard.subjectsEnrolled, icon: BookOpen, tone: "text-[#0B1F3A]", bg: "bg-[#0B1F3A]/10" },
    { label: "Questions attempted", value: dashboard.questionsAttempted, icon: Target, tone: "text-[#06B6D4]", bg: "bg-[#06B6D4]/10" },
    { label: "Study hours", value: dashboard.totalHoursStudied, icon: LineChart, tone: "text-[#14B8A6]", bg: "bg-[#14B8A6]/10" },
    { label: "Uploaded papers", value: uploadedPapers, icon: FileText, tone: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10" },
  ];

  return (
    <AppLayout>
      <div className="space-y-7">
        <header className="overflow-hidden rounded-3xl bg-[#0B1F3A] p-6 text-white shadow-sm md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                <Sparkles className="h-3.5 w-3.5 text-[#06B6D4]" />
                Student workspace
              </p>
              <h1 className="text-3xl font-bold md:text-4xl">
                Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 md:text-base">
                Your dashboard is scoped to the subjects you selected. Add papers, notes, and practice work to build real progress over time.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {nextSubject && (
                <Link
                  href={`/subject/${nextSubject.subjectId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#0B1F3A] transition-colors hover:bg-[#F8FAFC]"
                >
                  Continue studying
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Edit subjects
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${stat.bg} ${stat.tone}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="text-3xl font-bold text-[#0B1F3A]">{stat.value}</div>
              <div className="mt-1 text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#0B1F3A]">Selected subjects</h2>
                <p className="mt-1 text-sm text-gray-500">Only your chosen subjects appear here.</p>
              </div>
              <Link href="/onboarding" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-[#0B1F3A]">
                Change selection
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {selectedSubjects.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedSubjects.map((subject) => {
                  const totalActivity = subject.questionsAttempted + subject.papersCompleted + subject.notesRead;
                  return (
                    <Link key={subject.subjectId} href={`/subject/${subject.subjectId}`}>
                      <div className="group min-h-36 rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#0B1F3A]/30 hover:shadow-md hover:shadow-[#0B1F3A]/10">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white"
                              style={{ backgroundColor: subject.subjectColor }}
                            >
                              {subject.subjectName.charAt(0)}
                            </span>
                            <div>
                              <h3 className="font-semibold text-[#0B1F3A] group-hover:text-[#0B1F3A]">
                                {subject.subjectName}
                              </h3>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {totalActivity > 0 ? `${totalActivity} saved activity items` : "Ready to start"}
                              </p>
                            </div>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 text-gray-300 transition-colors group-hover:text-[#0B1F3A]" />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <Metric label="Questions" value={subject.questionsAttempted} />
                          <Metric label="Papers" value={subject.papersCompleted} />
                          <Metric label="Notes" value={subject.notesRead} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyPanel
                icon={BookOpen}
                title="No subjects selected"
                body="Choose O Level or A Level subjects to start building a focused dashboard."
                action={<Link href="/onboarding" className="font-semibold text-[#0B1F3A]">Choose subjects</Link>}
              />
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#0B1F3A]">Study snapshot</h2>
              <div className="mt-5 space-y-4">
                <SnapshotRow label="Selected subjects" value={dashboard.subjectsEnrolled} />
                <SnapshotRow label="Uploaded papers" value={uploadedPapers} />
                <SnapshotRow label="Questions attempted" value={dashboard.questionsAttempted} />
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#0B1F3A]">Recent activity</h2>
              {dashboard.recentActivity.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {dashboard.recentActivity.map((activity) => (
                    <div key={activity.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                      {activity.description}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-gray-500">No activity recorded yet. Open a selected subject to begin studying.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#F8FAFC]/70 px-3 py-2">
      <div className="text-sm font-bold text-[#0B1F3A]">{value}</div>
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-bold text-[#0B1F3A]">{value}</span>
    </div>
  );
}

function EmptyPanel({
  action,
  body,
  icon: Icon,
  title,
}: {
  action?: React.ReactNode;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-[#F8FAFC]/50 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#0B1F3A] shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="font-bold text-[#0B1F3A]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
