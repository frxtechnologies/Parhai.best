import { useClearAiHistory, useGetAiHistory, useGetSubject, useIsAdmin, useListPapers, useSendAiMessage } from "@/api/client";
import type { AiMessage } from "@/api/types";
import { AIErrorCard } from "@/components/ai-tutor/ai-error-card";
import { AIMessage as MessageCard, AIThinkingState } from "@/components/ai-tutor/ai-message";
import { ChatComposer } from "@/components/ai-tutor/chat-composer";
import { StudyContextPanel } from "@/components/ai-tutor/study-context-panel";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/context/auth-context";
import { exportQuestionWorksheet } from "@/lib/worksheet-export";
import { ArrowLeft, Download, Filter, PanelRight, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";

const QUICK_ACTIONS = [
  "Explain like a Cambridge teacher",
  "Give examiner-style answer",
  "Show marking scheme logic",
  "Find similar past-paper questions",
  "Generate 10-question quiz",
  "Show repeated topics",
  "Make a topical worksheet",
];

const STARTERS = [
  { label: "Find Light questions from 2020–2024", icon: "🔍" },
  { label: "Explain the most common exam mistakes", icon: "⚠️" },
  { label: "Generate a practice worksheet for this subject", icon: "📝" },
  { label: "Show most repeated topics in past papers", icon: "📊" },
];

const teacher = (name: string) =>
  /math/i.test(name) ? "Cambridge Mathematics Teacher" : `Cambridge ${name} Teacher`;

export default function SubjectAi() {
  const subjectId = Number(useParams().id ?? 0);
  const { user } = useAuth();
  const admin = useIsAdmin().isAdmin;
  const { data: subject, isLoading } = useGetSubject(subjectId);
  const { data: papers = [] } = useListPapers({ subjectId });
  const { data: history = [], isLoading: historyLoading } = useGetAiHistory(subjectId);
  const send = useSendAiMessage();
  const clear = useClearAiHistory();

  const [input, setInput] = useState("");
  const [paperId, setPaperId] = useState("");
  const [answerLength, setAnswerLength] = useState<"quick" | "teacher" | "full">("teacher");
  const [local, setLocal] = useState<AiMessage[]>([]);
  const [failed, setFailed] = useState<{ message: string; error: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const end = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => [...history, ...local], [history, local]);
  const paper = papers.find(p => p.id === Number(paperId));
  const latest = [...messages].reverse().find(m => m.role === "assistant");
  const name = subject ? teacher(subject.name) : "Cambridge Teacher";

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, send.isPending]);

  if (isLoading || historyLoading) {
    return (
      <AppLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
              <Sparkles className="h-6 w-6 animate-spin-slow" />
            </div>
            <p className="text-sm text-slate-500">Preparing your AI workspace…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!subject || !user) {
    return (
      <AppLayout>
        <div className="p-12 text-center text-slate-400">Subject not found.</div>
      </AppLayout>
    );
  }

  async function submit(text = input.trim()) {
    if (!text || send.isPending) return;
    const userMessage: AiMessage = {
      id: `local-${Date.now()}`,
      subjectId,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setLocal(c => [...c, userMessage]);
    setInput("");
    setFailed(null);
    try {
      const answer = await send.mutateAsync({
        userId: user!.id,
        studentName: user!.name,
        level: subject!.level,
        subjectId,
        subjectName: subject!.name,
        subjectCode: subject!.code,
        board: subject!.board,
        selectedPaperId: paper?.id ?? null,
        year: paper?.year ?? null,
        session: paper?.session ?? null,
        paperNumber: paper?.paperNumber ?? null,
        variant: paper?.variant ?? null,
        message: text,
        answerLength,
        chatHistory: messages,
      });
      setLocal(c => [...c, answer]);
    } catch (e) {
      const error = e instanceof Error ? e.message : "AI request failed.";
      setInput(text);
      setFailed({ message: text, error });
    }
  }

  function sourcesOnly() {
    const sources = latest?.sources ?? [];
    setLocal(c => [
      ...c,
      {
        id: `sources-${Date.now()}`,
        subjectId,
        role: "assistant",
        content: sources.length
          ? `I could not generate a full AI answer, but I kept ${sources.length} verified source${sources.length === 1 ? "" : "s"} available in the study context panel.`
          : "The provider is unavailable and no verified sources were returned for this request yet.",
        sources,
        createdAt: new Date().toISOString(),
      },
    ]);
    setFailed(null);
  }

  const sidebarContent = (
    <StudyContextPanel subject={subject} paper={paper} sources={latest?.sources ?? []} />
  );

  return (
    <AppLayout>
      <div className="-m-4 flex min-h-[calc(100vh-3.5rem)] flex-col bg-[#F5F4FE] sm:-m-6 md:min-h-screen">

        {/* ── Header ── */}
        <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/ai">
                <button className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </Link>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-500/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-sm font-bold text-[#1E1B4B]">{subject.name} AI Tutor</h1>
                  <span className="shrink-0 rounded-full border border-emerald-100 bg-emerald-50 font-bold text-[10px] text-emerald-600 px-2 py-0.5">
                    ● Online
                  </span>
                  {admin && (
                    <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 sm:inline">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {subject.code} · {subject.level.replace("_", " ")} · Cambridge
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${showFilters ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600"}`}
              >
                <Filter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filters</span>
              </button>

              {latest?.sources?.some(s => s.sourceType === "question") && (
                <>
                  <button
                    onClick={() => void exportQuestionWorksheet(`${subject.name} worksheet`, latest.sources ?? [], false)}
                    className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 sm:flex"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                  <button
                    onClick={() => void exportQuestionWorksheet(`${subject.name} worksheet with answers`, latest.sources ?? [], true)}
                    className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 md:flex"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF + answers
                  </button>
                </>
              )}

              <button
                onClick={() => setDrawer(true)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-indigo-300 lg:hidden"
              >
                <PanelRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => { setLocal([]); void clear.mutateAsync({ userId: user.id, subjectId }); }}
                disabled={!messages.length}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-red-200 hover:text-red-500 disabled:opacity-30"
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2">
                <select
                  value={paperId}
                  onChange={e => setPaperId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#1E1B4B] shadow-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value="">All {subject.name} papers</option>
                  {papers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.year} {p.session.replace("_", " ")} · P{p.paperNumber} · V{p.variant ?? "—"}
                    </option>
                  ))}
                </select>
                <select
                  value={answerLength}
                  onChange={e => setAnswerLength(e.target.value as typeof answerLength)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#1E1B4B] shadow-sm focus:border-indigo-400 focus:outline-none"
                >
                  <option value="quick">Quick answer</option>
                  <option value="teacher">Teacher explanation</option>
                  <option value="full">Full exam breakdown</option>
                </select>
              </div>
            </div>
          )}
        </header>

        {/* ── Grid ── */}
        <div className="mx-auto grid w-full max-w-[1500px] flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="flex min-h-[calc(100vh-70px)] flex-col border-r border-slate-200/60">
            <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
              <div className="mx-auto max-w-3xl">
                {messages.length === 0 ? (
                  <div className="mx-auto max-w-2xl py-12 text-center">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-500/25">
                      <Sparkles className="h-7 w-7" />
                    </div>
                    <h2 className="text-2xl font-bold text-[#1E1B4B]">Ask your {name}</h2>
                    <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-slate-500">
                      Search past papers, understand marking schemes, generate practice questions, and revise smarter.
                    </p>
                    <div className="mt-8 grid gap-3 sm:grid-cols-2">
                      {STARTERS.map(s => (
                        <button
                          key={s.label}
                          onClick={() => setInput(s.label)}
                          className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                        >
                          <span className="text-xl leading-none">{s.icon}</span>
                          <span className="text-sm font-medium leading-snug text-[#1E1B4B]">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messages.map(m => (
                      <MessageCard key={m.id} message={m} onExplain={setInput} />
                    ))}
                  </div>
                )}
                {send.isPending && <div className="mt-6"><AIThinkingState /></div>}
                {failed && (
                  <div className="mt-6">
                    <AIErrorCard
                      error={failed.error}
                      onRetry={() => submit(failed.message)}
                      onSourcesOnly={sourcesOnly}
                      isAdmin={admin}
                    />
                  </div>
                )}
                <div ref={end} />
              </div>
            </div>

            {/* Quick chips */}
            <div className="px-4 sm:px-6">
              <div className="mx-auto max-w-3xl">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {QUICK_ACTIONS.map(a => (
                    <button
                      key={a}
                      onClick={() => setInput(a)}
                      className="shrink-0 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600"
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <ChatComposer
              value={input}
              onChange={setInput}
              onSend={() => submit()}
              pending={send.isPending}
              placeholder={`Ask your ${name} about a concept, revision, or past paper…`}
            />
          </main>

          {/* Sidebar (desktop) */}
          <div className="hidden overflow-y-auto p-4 lg:block">
            {sidebarContent}
            {admin && (
              <a
                href="/admin/ai-testing"
                className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-[#1E1B4B] shadow-sm hover:border-indigo-300"
              >
                <ShieldCheck className="h-4 w-4 text-indigo-500" />
                Admin AI diagnostics
              </a>
            )}
          </div>
        </div>

        {/* Mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close study context"
              onClick={() => setDrawer(false)}
              className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm"
            />
            <div className="absolute right-0 top-0 h-full w-[min(90vw,360px)] overflow-y-auto bg-[#F5F4FE] p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-bold text-[#1E1B4B]">Study context</span>
                <button
                  onClick={() => setDrawer(false)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {sidebarContent}
              {admin && (
                <a
                  href="/admin/ai-testing"
                  className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-[#1E1B4B]"
                >
                  <ShieldCheck className="h-4 w-4 text-indigo-500" />
                  Admin AI diagnostics
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
