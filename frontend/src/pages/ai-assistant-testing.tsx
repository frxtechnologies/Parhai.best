import { API_BASE_URL } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { requireSupabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

type Subject = { id: number; name: string; code: string; level: "O_LEVEL" | "A_LEVEL"; board: string };
type Retrieved = { sourceType: string; id: number; reference: string; content: string; metadata: Record<string, unknown> };
type ProviderStatus = { provider: string; model: string; apiKeyDetected: boolean; configured: boolean; connectionStatus: string; testResponse?: string; error?: string };

export default function AiAssistantTesting() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [question, setQuestion] = useState("How many Light questions appeared in Physics 2024?");
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState<Retrieved[]>([]);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function authenticatedFetch(path: string, init?: RequestInit) {
    const { data } = await requireSupabase().auth.getSession();
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}`, ...init?.headers } });
  }

  useEffect(() => {
    requireSupabase().from("subjects").select("id,name,code,level,board").order("name").then(({ data }) => {
      const rows = (data ?? []) as Subject[];
      setSubjects(rows);
      setSubjectId(String(rows.find((row) => row.name.toLowerCase().includes("physics"))?.id ?? rows[0]?.id ?? ""));
    });
    void authenticatedFetch("/api/ai/provider-status").then(async (response) => setProvider(await response.json() as ProviderStatus));
  }, []);

  async function testProvider() {
    setLoading(true); setError("");
    const response = await authenticatedFetch("/api/ai/provider-test", { method: "POST" });
    const body = await response.json() as ProviderStatus;
    setProvider(body); setLoading(false);
    if (!response.ok) setError(body.error ?? "Provider test failed.");
  }

  async function runTest() {
    const subject = subjects.find((row) => row.id === Number(subjectId));
    if (!subject) return;
    setLoading(true); setAnswer(""); setError(""); setResults([]); setDiagnostics(null);
    try {
      const response = await authenticatedFetch("/api/ai-assistant", {
        method: "POST",
        body: JSON.stringify({ message: question, subjectId: subject.id, subjectName: subject.name, level: subject.level, board: subject.board, debug: true }),
      });
      const body = await response.json() as { answer?: string; error?: string; retrievedResults?: Retrieved[]; diagnostics?: Record<string, unknown> };
      setResults(body.retrievedResults ?? []); setDiagnostics(body.diagnostics ?? null);
      if (!response.ok) throw new Error(body.error ?? "Assistant test failed.");
      setAnswer(body.answer ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Assistant test failed."); }
    finally { setLoading(false); }
  }

  return <AppLayout><div className="space-y-6">
    <header><h1 className="text-3xl font-bold text-[#0B1F3A]">AI assistant testing</h1><p className="text-gray-500">Verify the active provider and inspect the exact subject-scoped Supabase evidence.</p></header>
    <section className="rounded-2xl border bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold text-[#0B1F3A]">Provider connection</h2><p className="mt-2 text-sm text-gray-600">Provider: <b>{provider?.provider ?? "Loading"}</b> · Model: <b>{provider?.model ?? "—"}</b> · API key detected: <b>{provider?.apiKeyDetected ? "Yes" : "No"}</b> · Status: <b>{provider?.connectionStatus ?? "—"}</b></p>{provider?.testResponse&&<p className="mt-2 text-sm text-emerald-700">{provider.testResponse}</p>}</div><button onClick={testProvider} disabled={loading} className="rounded-xl bg-[#14B8A6] px-4 py-2 font-semibold text-white disabled:opacity-50">Test connection</button></div></section>
    <section className="rounded-2xl border bg-white p-6"><div className="grid gap-4 md:grid-cols-[260px_1fr_auto]"><select className="field-input" value={subjectId} onChange={(event)=>setSubjectId(event.target.value)}>{subjects.map((subject)=><option key={subject.id} value={subject.id}>{subject.name} ({subject.code}, {subject.board})</option>)}</select><input className="field-input" value={question} onChange={(event)=>setQuestion(event.target.value)}/><button onClick={runTest} disabled={loading||!subjectId||!question.trim()} className="rounded-xl bg-[#0B1F3A] px-5 py-3 font-semibold text-white disabled:opacity-50">{loading?"Testing…":"Run RAG test"}</button></div></section>
    {error&&<section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</section>}
    {answer&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold text-[#0B1F3A]">AI final answer</h2><p className="mt-3 whitespace-pre-wrap text-sm">{answer}</p></section>}
    {diagnostics&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold text-[#0B1F3A]">Retrieval diagnostics</h2><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-gray-600">{JSON.stringify(diagnostics,null,2)}</pre></section>}
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold text-[#0B1F3A]">Supabase evidence sent to the active provider ({results.length})</h2><div className="mt-4 space-y-3">{results.map((result)=><details key={`${result.sourceType}-${result.id}`} className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">{result.reference} · {result.sourceType}</summary><pre className="mt-3 whitespace-pre-wrap text-xs text-gray-600">{JSON.stringify(result.metadata,null,2)}{"\n\n"}{result.content}</pre></details>)}{!results.length&&!loading&&<p className="text-sm text-gray-500">No records retrieved yet.</p>}</div></section>
  </div></AppLayout>;
}
