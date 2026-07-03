import { useListSubjects } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { agentApi } from "@/lib/agent-api";
import { useAuth } from "@/context/auth-context";
import { useState } from "react";
export default function RepeatedTopics() {
  const { user } = useAuth(),
    { data: subjects = [] } = useListSubjects({ level: user?.level ?? undefined }),
    [subjectId, setSubjectId] = useState(""),
    [years, setYears] = useState(5),
    [data, setData] = useState<any>(),
    [loading, setLoading] = useState(false);
  const subject = subjects.find((s) => s.id === Number(subjectId));
  async function run() {
    if (!subject) return;
    setLoading(true);
    const end = new Date().getFullYear();
    try {
      setData(
        await agentApi(
          `/agents/repeated-topics?subject_id=${subject.id}&level=${subject.level}&syllabus_code=${subject.code}&year_from=${end - years + 1}&year_to=${end}`,
        ),
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-sm font-semibold text-cyan-700">Parhai AI Agent</p>
          <h1 className="text-3xl font-bold text-[#0B1F3A]">
            Most Repeated Topics
          </h1>
          <p className="text-slate-500">
            Transparent past-paper patterns—not guaranteed predictions.
          </p>
        </header>
        <div className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <select
            className="rounded-xl border p-3"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Select subject</option>
            {subjects.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} {s.code}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border p-3"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
          >
            {[3, 5, 10].map((y) => (
              <option key={y} value={y}>
                Last {y} years
              </option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={!subject || loading}
            className="rounded-xl bg-[#0B1F3A] px-5 py-3 font-semibold text-white"
          >
            {loading ? "Calculating…" : "Calculate trends"}
          </button>
        </div>
        {data && (
          <>
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              {data.warning}
              {!data.reliable &&
                " Not enough indexed papers for reliable trend analysis."}
            </p>
            <div className="overflow-x-auto rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th>Rank</th>
                    <th>Topic</th>
                    <th>Questions</th>
                    <th>Marks</th>
                    <th>Years</th>
                    <th>Difficulty</th>
                    <th>Score</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topics.map((t: any) => (
                    <tr key={t.topic} className="border-t">
                      <td className="py-4 font-bold">#{t.rank}</td>
                      <td>
                        <p className="font-semibold">{t.topic}</p>
                        <p className="text-xs text-slate-400">
                          {t.subtopics.join(", ")}
                        </p>
                      </td>
                      <td>{t.questionCount}</td>
                      <td>{t.totalMarks}</td>
                      <td>{t.yearsAppeared.join(", ")}</td>
                      <td>
                        {t.difficulty.EASY}/{t.difficulty.MEDIUM}/
                        {t.difficulty.HARD}
                      </td>
                      <td>
                        <span className="rounded-full bg-cyan-50 px-2 py-1 font-semibold text-cyan-800">
                          {t.predictionScore} · {t.predictionLabel}
                        </span>
                      </td>
                      <td className="capitalize">{t.trend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
