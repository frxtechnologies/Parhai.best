import { useListPapers } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { agentApi } from "@/lib/agent-api";
import { useState } from "react";
type Analysis = any;
export default function PaperAnalyzerAgentPage() {
  const { data: papers = [] } = useListPapers({ type: "PAST_PAPER" }),
    [paperId, setPaperId] = useState(""),
    [data, setData] = useState<Analysis>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function analyze() {
    if (!paperId) return;
    setLoading(true);
    setError("");
    try {
      setData(await agentApi(`/agents/paper-analyzer/${paperId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-[#0B1F3A] p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
            Parhai AI Agent
          </p>
          <h1 className="mt-2 text-3xl font-bold">AI Paper Analyzer</h1>
          <p className="mt-2 text-slate-300">
            Verified Cambridge paper intelligence from indexed questions.
          </p>
        </header>
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:flex-row">
          <select
            value={paperId}
            onChange={(e) => setPaperId(e.target.value)}
            className="flex-1 rounded-xl border p-3"
          >
            <option value="">Select an indexed paper</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.subjectName} · {p.year} {p.session.replace("_", " ")} · Paper{" "}
                {p.paperNumber} Variant {p.variant}
              </option>
            ))}
          </select>
          <button
            disabled={!paperId || loading}
            onClick={analyze}
            className="rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            {loading ? "Analyzing…" : "Analyze paper"}
          </button>
        </section>
        {error && (
          <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
        )}
        {data && (
          <>
            <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Indexed", data.overview.totalIndexedQuestions],
                ["Verified", data.overview.verifiedQuestions],
                ["Marks", data.overview.totalMarks],
                ["MS linked", data.overview.markingSchemeLinked],
                ["Screenshots", data.overview.screenshotsAvailable],
                ["Status", data.overview.completeness],
              ].map(([x, y]) => (
                <div
                  className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                  key={x}
                >
                  <p className="text-xs text-slate-500">{x}</p>
                  <p className="mt-1 text-xl font-bold text-[#0B1F3A]">{y}</p>
                </div>
              ))}
            </section>
            {data.warnings.map((w: string) => (
              <p
                key={w}
                className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              >
                {w}
              </p>
            ))}
            <section className="overflow-x-auto rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="mb-4 text-lg font-bold">Topic breakdown</h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th>Topic</th>
                    <th>Questions</th>
                    <th>Marks</th>
                    <th>Difficulty</th>
                    <th>Subtopics</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topics.map((t: any) => (
                    <tr key={t.topic} className="border-t">
                      <td className="py-3 font-semibold">{t.topic}</td>
                      <td>{t.questions}</td>
                      <td>{t.marks}</td>
                      <td>{t.averageDifficulty}</td>
                      <td>{Object.keys(t.subtopics).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="font-bold">Question types</h2>
                {Object.entries(data.questionTypes).map(([name, v]: any) => (
                  <div
                    key={name}
                    className="mt-3 flex justify-between border-b pb-2 text-sm"
                  >
                    <span>{name}</span>
                    <span>{v.questions} questions</span>
                  </div>
                ))}
              </section>
              <section className="rounded-2xl bg-violet-50 p-5 ring-1 ring-violet-100">
                <h2 className="font-bold text-violet-950">
                  Do this paper if you are weak in
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.weakInRecommendation.map((x: string) => (
                    <span
                      key={x}
                      className="rounded-full bg-white px-3 py-1.5 text-sm text-violet-800"
                    >
                      {x}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
