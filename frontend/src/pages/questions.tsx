import { AppLayout } from "@/components/layout/app-layout";
import { useListQuestions, getListQuestionsQueryKey } from "@/api/client";
import { useState } from "react";
import { Eye, CheckCircle2 } from "lucide-react";

export default function Questions() {
  const { data: questions, isLoading } = useListQuestions(
    {},
    { query: { queryKey: getListQuestionsQueryKey({}) } }
  );
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const toggleReveal = (id: number) => {
    setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-[#0B1F3A] mb-2">Topical Questions</h1>
          <p className="text-gray-500">Practice questions added in Supabase will appear here by topic.</p>
        </header>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading questions...</div>
        ) : (
          <div className="space-y-6">
            {questions?.map((q) => (
              <div key={q.id} className="bg-white rounded-xl border overflow-hidden p-6">
                <div className="flex items-start justify-between mb-4 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#0B1F3A]">{q.subjectName}</span>
                      <span className="text-sm text-gray-400">• {q.topic}</span>
                    </div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                        q.difficulty === "HARD"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : q.difficulty === "MEDIUM"
                          ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                          : "bg-green-50 text-green-700 border-green-200"
                      }`}
                    >
                      {q.difficulty}
                    </span>
                  </div>
                  <div className="text-sm font-medium bg-gray-100 px-2 py-1 rounded shrink-0">
                    {q.marks} marks
                  </div>
                </div>

                <p className="text-[#0B1F3A] mb-6">{q.question}</p>

                {revealed[q.id] ? (
                  <div className="bg-green-50/50 border border-green-100 rounded-xl p-5 mt-4 space-y-4">
                    <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
                      <CheckCircle2 className="h-5 w-5" />
                      <span>Answer Key</span>
                    </div>
                    <p className="text-gray-800">{q.answer}</p>
                    {q.markingPoints.length > 0 && (
                      <div className="mt-4">
                        <span className="text-sm font-semibold text-green-800">Marking Points:</span>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-700">
                          {q.markingPoints.map((pt, i) => (
                            <li key={i}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      onClick={() => toggleReveal(q.id)}
                      className="mt-4 px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      Hide Answer
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleReveal(q.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#14B8A6]/10 text-[#14B8A6] rounded-lg text-sm font-medium hover:bg-[#14B8A6]/20 transition-colors"
                  >
                    <Eye className="h-4 w-4" /> Reveal Answer
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
