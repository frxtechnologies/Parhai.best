import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGenerateRevisionPlan, useGetDashboard } from "@/api/client";
import type { RevisionActivity, RevisionPhase, RevisionPlan } from "@/api/types";
import { CalendarClock, GraduationCap, Lightbulb, Loader2, Sparkles } from "lucide-react";

const PHASE_LABELS: Record<RevisionPhase, string> = {
  foundation: "Foundation",
  practice: "Practice",
  final_review: "Final review",
};

const ACTIVITY_STYLES: Record<RevisionActivity, { label: string; className: string }> = {
  learn: { label: "Learn", className: "bg-blue-50 text-blue-700" },
  practice: { label: "Practice", className: "bg-teal-50 text-teal-700" },
  review: { label: "Review", className: "bg-amber-50 text-amber-700" },
  mock_paper: { label: "Mock paper", className: "bg-purple-50 text-purple-700" },
};

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

export default function RevisionPlanner() {
  const { data: dashboard } = useGetDashboard();
  const enrolledSubjects = useMemo(() => dashboard?.subjectProgress.map((s) => s.subjectName) ?? [], [dashboard]);

  const [examDate, setExamDate] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [weakTopics, setWeakTopics] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [studyDaysPerWeek, setStudyDaysPerWeek] = useState(6);
  const [preparationLevel, setPreparationLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [error, setError] = useState("");

  const { mutate, data: plan, isPending } = useGenerateRevisionPlan();

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((current) =>
      current.includes(subject) ? current.filter((s) => s !== subject) : [...current, subject],
    );
  };

  const handleGenerate = () => {
    setError("");
    const subjects = selectedSubjects.length > 0 ? selectedSubjects : enrolledSubjects;
    if (!examDate) return setError("Choose your exam date.");
    if (subjects.length === 0) return setError("Select at least one subject (or add subjects in onboarding first).");

    mutate(
      {
        examDate,
        subjects,
        weakTopics: weakTopics.split(",").map((t) => t.trim()).filter(Boolean),
        hoursPerDay,
        studyDaysPerWeek,
        preparationLevel,
      },
      { onError: (err) => setError(err.message) },
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-10">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <CalendarClock className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0B1F3A]">AI Revision Planner</h1>
              <p className="mt-1 text-sm text-slate-500">Build a day-by-day study timetable that counts down to your exam.</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <Field label="Exam date">
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-[#0B1F3A] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </Field>

            <Field label="Subjects">
              {enrolledSubjects.length === 0 ? (
                <p className="text-sm text-slate-400">No subjects yet — add them from onboarding to plan revision.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {enrolledSubjects.map((subject) => {
                    const active = selectedSubjects.includes(subject);
                    return (
                      <button
                        key={subject}
                        type="button"
                        onClick={() => toggleSubject(subject)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          active ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {subject}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1.5 text-xs text-slate-400">Leave all unselected to include every subject.</p>
            </Field>

            <Field label="Weak topics (optional)">
              <input
                type="text"
                value={weakTopics}
                onChange={(e) => setWeakTopics(e.target.value)}
                placeholder="e.g. Momentum, Trigonometry"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-[#0B1F3A] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
              <p className="mt-1.5 text-xs text-slate-400">Comma-separated. These get prioritised early in the plan.</p>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Hours per day">
                <input
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-[#0B1F3A] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </Field>
              <Field label="Study days / week">
                <select
                  value={studyDaysPerWeek}
                  onChange={(e) => setStudyDaysPerWeek(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-[#0B1F3A] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                >
                  {[3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>{n} days</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Preparation level">
              <div className="grid grid-cols-3 gap-2">
                {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setPreparationLevel(lvl)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition ${
                      preparationLevel === lvl ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </Field>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#142f50] disabled:opacity-50"
            >
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Building plan…</> : <><Sparkles className="h-4 w-4" /> Generate plan</>}
            </button>
          </section>

          <section>
            {plan ? <PlanView plan={plan} /> : <EmptyPlan />}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function PlanView({ plan }: { plan: RevisionPlan }) {
  const studyDays = plan.days.filter((day) => !day.isRestDay);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Stat icon={GraduationCap} value={`${plan.daysUntilExam}`} label="days to exam" />
          <Stat icon={CalendarClock} value={`${plan.studyDays}`} label="study days" />
          <Stat icon={Sparkles} value={`${plan.subjects.length}`} label="subjects" />
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">{plan.summary}</p>
      </div>

      {plan.aiGuidance && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
            <Lightbulb className="h-4 w-4 text-amber-500" /> AI study guidance
          </div>
          <div className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{plan.aiGuidance}</div>
        </div>
      )}

      <div className="space-y-3">
        {studyDays.map((day) => (
          <div key={day.date} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#0B1F3A]">{day.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">{PHASE_LABELS[day.phase]}</span>
              </div>
              <span className="text-xs text-slate-400">{formatHours(day.totalMinutes)}</span>
            </div>
            <div className="space-y-2">
              {day.sessions.map((session, index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${ACTIVITY_STYLES[session.activity].className}`}>
                    {ACTIVITY_STYLES[session.activity].label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#0B1F3A]">{session.subject}</p>
                    <p className="truncate text-xs text-slate-500">{session.focus}</p>
                  </div>
                  <span className="text-xs text-slate-400">{session.minutes}m</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-5 w-5 text-teal-700" />
      <span className="text-2xl font-semibold text-[#0B1F3A]">{value}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">{label}</label>
      {children}
    </div>
  );
}

function EmptyPlan() {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
      <CalendarClock className="h-8 w-8 text-slate-300" />
      <h2 className="mt-3 font-semibold text-[#0B1F3A]">Your timetable will appear here</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">Set your exam date and subjects, then generate a personalised revision schedule.</p>
    </div>
  );
}
