import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/context/auth-context";
import {
  useClearAiHistory,
  useGetAiHistory,
  useGetSubject,
  useListPapers,
  useSendAiMessage,
} from "@/api/client";
import type { AiMessage, Paper } from "@/api/types";
import { Bot, ImageUp, Send, Sparkles, Trash2, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";

const suggestedPrompts = [
  "Explain this topic like a Cambridge teacher",
  "Give an examiner-style answer",
  "Show the marking scheme logic",
  "Find similar past paper questions",
  "Make a 10-question quiz from this topic",
  "Tell me what mistakes students usually make",
  "Create a revision plan for this topic",
  "Summarize this paper",
  "Predict repeated question patterns from past papers",
];

function teacherNameFor(subjectName: string) {
  if (/math/i.test(subjectName)) return "Cambridge Mathematics Teacher";
  return `Cambridge ${subjectName} Teacher`;
}

export default function SubjectAi() {
  const params = useParams();
  const subjectId = Number(params.id ?? 0);
  const { user } = useAuth();
  const { data: subject, isLoading: isLoadingSubject } = useGetSubject(subjectId);
  const { data: papers = [] } = useListPapers({ subjectId });
  const { data: history = [], isLoading: isLoadingHistory } = useGetAiHistory(subjectId);
  const sendMessage = useSendAiMessage();
  const clearHistory = useClearAiHistory();
  const [input, setInput] = useState("");
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [localMessages, setLocalMessages] = useState<AiMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => [...history, ...localMessages], [history, localMessages]);
  const selectedPaper = papers.find((paper) => paper.id === Number(selectedPaperId));
  const teacherName = subject ? teacherNameFor(subject.name) : "Cambridge Teacher";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMessage.isPending]);

  if (isLoadingSubject || isLoadingHistory) {
    return (
      <AppLayout>
        <div className="flex h-[50vh] items-center justify-center text-sm text-gray-500">Loading AI assistant...</div>
      </AppLayout>
    );
  }

  if (!subject || !user) {
    return (
      <AppLayout>
        <div className="rounded-2xl border bg-white p-10 text-center text-gray-500">Subject not found.</div>
      </AppLayout>
    );
  }

  async function handleSend(message = input.trim()) {
    if (!message || !subject || !user || sendMessage.isPending) return;

    const userMessage: AiMessage = {
      id: `local-${Date.now()}`,
      subjectId,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };

    setLocalMessages((current) => [...current, userMessage]);
    setInput("");

    try {
      const aiMessage = await sendMessage.mutateAsync({
        userId: user.id,
        studentName: user.name,
        level: subject.level,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectCode: subject.code,
        board: subject.board,
        selectedPaperId: selectedPaper?.id ?? null,
        year: selectedPaper?.year ?? null,
        session: selectedPaper?.session ?? null,
        paperNumber: selectedPaper?.paperNumber ?? null,
        variant: selectedPaper?.variant ?? null,
        message,
        chatHistory: messages,
      });
      setLocalMessages((current) => [...current, aiMessage]);
    } catch {
      setLocalMessages((current) => current.filter((item) => item.id !== userMessage.id));
    }
  }

  async function handleClear() {
    if (!user) return;
    setLocalMessages([]);
    await clearHistory.mutateAsync({ userId: user.id, subjectId });
  }

  return (
    <AppLayout>
      <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
              <Sparkles className="h-4 w-4" />
              Subject Teacher
            </div>
            <h1 className="text-2xl font-bold text-[#0B1F3A]">{teacherName}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Locked to {subject.name} ({subject.code}) · Cambridge teaching with verified Parhai evidence.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={selectedPaperId} onChange={(event) => setSelectedPaperId(event.target.value)} className="field-input min-w-64">
              <option value="">All uploaded papers for this subject</option>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.year} {paper.session.replace("_", " ")} P{paper.paperNumber}
                  {paper.variant ? ` v${paper.variant}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={handleClear}
              disabled={clearHistory.isPending || messages.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[1fr_320px]">
          <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex-1 overflow-y-auto p-5">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center">
                  <div className="max-w-md">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F8FAFC] text-[#0B1F3A]">
                      <Bot className="h-7 w-7" />
                    </div>
                    <h2 className="text-xl font-bold text-[#0B1F3A]">Ask your {teacherName}</h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Learn concepts, revise chapters, practise exam technique, or search real uploaded papers and marking schemes.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <ChatBubble key={message.id} message={message} />
                  ))}
                </div>
              )}

              {sendMessage.isPending && (
                <div className="mt-4 flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#06B6D4]/10 text-[#06B6D4]">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-none border bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    Preparing a subject-locked Cambridge answer...
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {sendMessage.error && (
              <div className="border-t bg-red-50 px-5 py-3 text-sm text-red-700">{sendMessage.error.message}</div>
            )}

            <div className="border-t p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestedPrompts.slice(0, 5).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-full bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0F7FA]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Ask your ${teacherName} about a concept, revision, or past paper...`}
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-[#0B1F3A] focus:bg-white focus:ring-4 focus:ring-[#0B1F3A]/10"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || sendMessage.isPending}
                  className="rounded-xl bg-[#0B1F3A] px-4 py-3 text-white transition-colors hover:bg-[#08162B] disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="font-bold text-[#0B1F3A]">Teacher Scope</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <p>Level: {subject.level === "O_LEVEL" ? "O Level" : "A Level"}</p>
                <p>Subject: {subject.name}</p>
                <p>Code: {subject.code}</p>
                <p>Board: {subject.board}</p>
                <p>Paper filter: {selectedPaper ? `${selectedPaper.year} P${selectedPaper.paperNumber}` : "All subject papers"}</p>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 font-bold text-[#0B1F3A]">
                <ImageUp className="h-5 w-5 text-[#14B8A6]" />
                Image Question
              </div>
              <div className="rounded-xl border border-dashed bg-gray-50 p-5 text-center text-sm text-gray-500">
                Image upload UI is prepared. OCR and image-question backend are pending.
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="font-bold text-[#0B1F3A]">More prompts</h2>
              <div className="mt-3 space-y-2">
                {suggestedPrompts.slice(5).map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    className="block w-full rounded-xl bg-gray-50 px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-[#F8FAFC] hover:text-[#0B1F3A]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <Link href={`/subject/${subject.id}`} className="block rounded-xl border bg-white px-4 py-3 text-center text-sm font-semibold text-[#0B1F3A]">
              Back to subject workspace
            </Link>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function ChatBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-[#0B1F3A] text-white" : "bg-[#06B6D4]/10 text-[#06B6D4]"}`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser ? "rounded-tr-none bg-[#0B1F3A] text-white" : "rounded-tl-none border bg-gray-50 text-[#0B1F3A]"
        }`}
      >
        {isUser ? message.content : <FormattedAnswer content={message.content} />}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-[#0B1F3A]/10 pt-2 text-xs text-gray-500">
            <div className="mb-1 font-semibold text-[#0B1F3A]">Verified sources</div>
            {message.sources.slice(0, 8).map((source) => (
              <div key={`${source.sourceType}-${source.chunkId}`} className="py-1">
                {source.screenshotUrl && <img src={source.screenshotUrl} alt={`Question ${source.questionNumber ?? ""}`} className="mb-2 max-h-96 w-full rounded-lg border bg-white object-contain" />}
                {source.questionText && <p className="mb-1 text-gray-600">{source.questionText}</p>}
                {source.answerText && <p className="mb-1 rounded-md bg-emerald-50 p-2 text-emerald-800"><b>Marking scheme:</b> {source.answerText}</p>}
                <div>{source.reference}{source.sourcePage ? ` · Page ${source.sourcePage}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FormattedAnswer({ content }: { content: string }) {
  return <div className="space-y-2">{content.split(/\n+/).filter(Boolean).map((line, index) => {
    const value = line.trim();
    const heading = value.match(/^#{1,4}\s+(.+)$/);
    if (heading) return <h3 key={index} className="pt-2 font-bold text-[#0B1F3A]">{heading[1]}</h3>;
    if (/^-\s+/.test(value)) return <div key={index} className="flex gap-2"><span aria-hidden>•</span><span>{value.replace(/^-\s+/, "")}</span></div>;
    if (/^[-•]\s+/.test(value)) return <div key={index} className="flex gap-2"><span aria-hidden>•</span><span>{value.replace(/^[-•]\s+/, "")}</span></div>;
    if (/^(?:answer|explanation|steps?|key points?|exam-style answer):?$/i.test(value)) return <div key={index} className="font-bold text-[#0B1F3A]">{value.replace(/:$/, "")}</div>;
    return <p key={index}>{value}</p>;
  })}</div>;
}
