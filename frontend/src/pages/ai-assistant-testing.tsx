import { API_BASE_URL } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { requireSupabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

type Subject = { id: number; name: string; code: string; level: "O_LEVEL" | "A_LEVEL" };
type Retrieved = { sourceType: string; id: number; reference: string; content: string; metadata: Record<string, unknown> };
type MatchedPaper = { id: number; title: string; year: number; session: string; paper_number: number; variant: number | null; ingestion_status: string; raw_text: string | null };
type MatchedQuestion = { id: number; paper_id: number; question_number: string; question_text: string; topic: string; subtopic: string | null; difficulty: string; marks: number };
type Diagnostics = { matchedPapers: MatchedPaper[]; extractedQuestionCount: number; matchedQuestionRows: MatchedQuestion[] };

export default function AiAssistantTesting() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [question, setQuestion] = useState("How many Light questions appeared in Physics 2024?");
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState<Retrieved[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    requireSupabase().from("subjects").select("id,name,code,level").order("name").then(({ data }) => {
      const rows = (data ?? []) as Subject[];
      setSubjects(rows);
      const physics = rows.find((row) => row.name.toLowerCase().includes("physics"));
      setSubjectId(String(physics?.id ?? rows[0]?.id ?? ""));
    });
  }, []);

  async function runTest() {
    const subject = subjects.find((row) => row.id === Number(subjectId));
    if (!subject) return;
    setLoading(true); setAnswer(""); setError(""); setResults([]); setDiagnostics(null);
    try {
      const client = requireSupabase();
      const { data } = await client.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/ai-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ message: question, subjectId: subject.id, level: subject.level, debug: true }),
      });
      const body = await response.json() as { answer?: string; error?: string; retrievedResults?: Retrieved[]; diagnostics?: Diagnostics };
      setResults(body.retrievedResults ?? []); setDiagnostics(body.diagnostics ?? null);
      if (!response.ok) throw new Error(body.error ?? "Assistant test failed.");
      setAnswer(body.answer ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Assistant test failed."); }
    finally { setLoading(false); }
  }

  return <AppLayout><div className="space-y-6"><div><h1 className="text-3xl font-bold text-[#0B1F3A]">AI assistant testing</h1><p className="text-gray-500">Inspect the exact Supabase records sent to Gemini.</p></div><div className="rounded-2xl border bg-white p-6"><div className="grid gap-4 md:grid-cols-[260px_1fr_auto]"><select className="field-input" value={subjectId} onChange={(event)=>setSubjectId(event.target.value)}>{subjects.map((subject)=><option key={subject.id} value={subject.id}>{subject.name} ({subject.code})</option>)}</select><input className="field-input" value={question} onChange={(event)=>setQuestion(event.target.value)} /><button onClick={runTest} disabled={loading||!subjectId||!question.trim()} className="rounded-xl bg-[#0B1F3A] px-5 py-3 font-semibold text-white disabled:opacity-50">{loading?"Testing…":"Run test"}</button></div></div>{error&&<section className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-bold text-red-800">Error</h2><p className="mt-2 text-sm text-red-700">{error}</p></section>}{diagnostics&&<section className="grid gap-4 md:grid-cols-3"><Metric label="Matched papers" value={diagnostics.matchedPapers.length}/><Metric label="Extracted questions" value={diagnostics.extractedQuestionCount}/><Metric label="Matched question rows" value={diagnostics.matchedQuestionRows.length}/><div className="rounded-2xl border bg-white p-5 md:col-span-3"><h2 className="font-bold text-[#0B1F3A]">Matched paper</h2>{diagnostics.matchedPapers.map((paper)=><p key={paper.id} className="mt-2 text-sm">{paper.title} · {paper.year} {paper.session} P{paper.paper_number}{paper.variant?` v${paper.variant}`:""} · {paper.raw_text?"processed":"not processed"}</p>)}</div></section>}{answer&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold text-[#0B1F3A]">AI final answer</h2><p className="mt-3 whitespace-pre-wrap text-sm">{answer}</p></section>}<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold text-[#0B1F3A]">Matched question rows ({diagnostics?.matchedQuestionRows.length ?? 0})</h2><div className="mt-4 space-y-3">{diagnostics?.matchedQuestionRows.map((row)=><details key={row.id} className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Q{row.question_number} · {row.topic}{row.subtopic?` / ${row.subtopic}`:""}</summary><p className="mt-3 text-sm text-gray-600">{row.question_text}</p></details>)}{diagnostics&&!diagnostics.matchedQuestionRows.length&&<p className="text-sm text-gray-500">No matching extracted questions.</p>}</div></section><section className="rounded-2xl border bg-white p-5"><h2 className="font-bold text-[#0B1F3A]">Supabase results sent to Gemini ({results.length})</h2><div className="mt-4 space-y-3">{results.map((result)=><details key={`${result.sourceType}-${result.id}`} className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">{result.reference} · {result.sourceType}</summary><pre className="mt-3 whitespace-pre-wrap text-xs text-gray-600">{JSON.stringify(result.metadata,null,2)}{"\n\n"}{result.content}</pre></details>)}{!results.length&&!loading&&<p className="text-sm text-gray-500">No records were sent to Gemini.</p>}</div></section></div></AppLayout>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-3xl font-bold text-[#0B1F3A]">{value}</p></div>; }
