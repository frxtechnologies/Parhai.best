import { useListSubjects } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { agentApi } from "@/lib/agent-api";
import { useAuth } from "@/context/auth-context";
import { useState } from "react";
export default function RevisionPlanner() {
  const { user } = useAuth(),
    { data: subjects = [] } = useListSubjects({ level: user?.level ?? undefined }),
    [form, setForm] = useState({
      subjectId: "",
      currentGrade: "C",
      targetGrade: "A",
      examDate: "",
      hoursPerDay: 2,
      planLengthDays: 14,
      weakTopics: "Light, Electricity",
      preferredStyle: "Past-paper practice",
    }),
    [plan, setPlan] = useState<any>(),
    [loading, setLoading] = useState(false);
  const subject = subjects.find((s) => s.id === Number(form.subjectId));
  const set = (k: string, v: any) => setForm((x) => ({ ...x, [k]: v }));
  async function generate() {
    if (!subject) return;
    setLoading(true);
    try {
      setPlan(
        await agentApi("/agents/revision-planner", {
          method: "POST",
          body: JSON.stringify({
            subjectId: subject.id,
            level: subject.level,
            syllabusCode: subject.code,
            currentGrade: form.currentGrade,
            targetGrade: form.targetGrade,
            examDate: form.examDate,
            hoursPerDay: Number(form.hoursPerDay),
            planLengthDays: Number(form.planLengthDays),
            weakTopics: form.weakTopics
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            preferredStyle: form.preferredStyle,
          }),
        }),
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-r from-violet-700 to-blue-700 p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-200">
            Parhai AI Agent
          </p>
          <h1 className="mt-2 text-3xl font-bold">AI Revision Planner</h1>
          <p className="mt-2 text-violet-100">
            A database-informed plan built around your time and weak topics.
          </p>
        </header>
        <section className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-500">
            Subject
            <select
              className="mt-1 w-full rounded-xl border p-3 text-sm"
              value={form.subjectId}
              onChange={(e) => set("subjectId", e.target.value)}
            >
              <option value="">Choose</option>
              {subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name} {s.code}
                </option>
              ))}
            </select>
          </label>
          {[
            ["Current grade", "currentGrade"],
            ["Target grade", "targetGrade"],
            ["Exam date", "examDate"],
          ].map(([label, key]) => (
            <label key={key} className="text-xs text-slate-500">
              {label}
              <input
                type={key === "examDate" ? "date" : "text"}
                className="mt-1 w-full rounded-xl border p-3 text-sm"
                value={(form as any)[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </label>
          ))}
          <label className="text-xs text-slate-500">
            Hours/day
            <input
              type="number"
              min="0.5"
              max="12"
              step=".5"
              className="mt-1 w-full rounded-xl border p-3 text-sm"
              value={form.hoursPerDay}
              onChange={(e) => set("hoursPerDay", e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500">
            Plan length
            <select
              className="mt-1 w-full rounded-xl border p-3 text-sm"
              value={form.planLengthDays}
              onChange={(e) => set("planLengthDays", e.target.value)}
            >
              {[7, 14, 30, 90].map((x) => (
                <option key={x} value={x}>
                  {x} days
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Weak topics
            <input
              className="mt-1 w-full rounded-xl border p-3 text-sm"
              value={form.weakTopics}
              onChange={(e) => set("weakTopics", e.target.value)}
            />
          </label>
          <button
            disabled={!subject || !form.examDate || loading}
            onClick={generate}
            className="rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            {loading ? "Building plan…" : "Generate and save plan"}
          </button>
        </section>
        {plan && (
          <>
            <section className="grid gap-3 sm:grid-cols-4">
              {[
                ["Days to exam", plan.summary.daysUntilExam],
                ["Target", plan.summary.targetGrade],
                ["Daily minutes", plan.summary.dailyMinutes],
                ["Plan", plan.summary.planType],
              ].map(([x, y]) => (
                <div
                  key={x}
                  className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                >
                  <p className="text-xs text-slate-500">{x}</p>
                  <p className="mt-1 font-bold">{y}</p>
                </div>
              ))}
            </section>
            <section className="space-y-3">
              {plan.days.map((day: any) => (
                <article
                  key={day.day}
                  className="rounded-2xl bg-white p-5 ring-1 ring-slate-200"
                >
                  <div className="flex justify-between">
                    <h3 className="font-bold">
                      Day {day.day} · {day.topic}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {day.date} · {day.estimatedMinutes} min
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {day.tasks.map((task: any) => (
                      <div
                        key={task.type}
                        className="rounded-xl bg-slate-50 p-3 text-sm"
                      >
                        <p className="font-semibold capitalize">
                          {task.type.replace("_", " ")} · {task.minutes} min
                        </p>
                        <p className="mt-1 text-slate-600">{task.task}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
