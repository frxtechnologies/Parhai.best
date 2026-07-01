import type { AiMessage as Message, TutorAction } from "@/api/types";
import { Bot, CheckCheck, Lightbulb, User } from "lucide-react";
import { useState } from "react";
import { SourceCard } from "./source-card";
import { PaperCard } from "./paper-card";
import { PaperAnalysisCard } from "./paper-analysis-card";

function Answer({
  content,
  suppressTeacherTip = false,
}: {
  content: string;
  suppressTeacherTip?: boolean;
}) {
  const lines = content.split(/\n+/).filter(Boolean);
  const visibleLines = suppressTeacherTip
    ? lines.filter((line, index) => {
        const previous = lines[index - 1]
          ?.replace(/^#+\s*/, "")
          .trim()
          .toLowerCase();
        const current = line
          .replace(/^#+\s*/, "")
          .trim()
          .toLowerCase();
        return current !== "teacher tip" && previous !== "teacher tip";
      })
    : lines;
  return (
    <div className="space-y-3">
      {visibleLines.map((line, i) => {
        const value = line.trim();
        const heading = value.match(/^#{1,4}\s*(?:\d+\.)?\s*(.+)$/);
        if (heading)
          return (
            <h3 key={i} className="pt-2 text-base font-semibold text-[#0B1F3A]">
              {heading[1]}
            </h3>
          );
        if (/^[-•]\s+/.test(value))
          return (
            <div key={i} className="flex gap-2">
              <span className="text-emerald-600">•</span>
              <span>{value.replace(/^[-•]\s+/, "")}</span>
            </div>
          );
        return <p key={i}>{value}</p>;
      })}
    </div>
  );
}

export function AIMessage({
  message,
  onExplain,
  onAction,
  adminDebug = false,
  schemeOnly = false,
}: {
  message: Message;
  onExplain?: (prompt: string) => void;
  onAction?: (action:TutorAction,label:string)=>void;
  adminDebug?: boolean;
  schemeOnly?: boolean;
}) {
  const user = message.role === "user";
  const [visibleSources, setVisibleSources] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 639px)").matches
      ? 3
      : 10,
  );
  const sources = (message.sources ?? []).filter(
    (source) =>
      !schemeOnly ||
      Boolean(source.answerText) ||
      ["linked", "partial", "linked_exact", "linked_partial"].includes(source.markingSchemeLinkStatus ?? ""),
  );
  const questions = sources.filter(
    (source) => source.sourceType === "question",
  );
  const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const actions=message.intent==="question_search"
      ? ["Show more","Only hard ones","Show marking schemes","Make a practice set"]
      : ["Explain simpler","Show marking scheme logic","Give examiner-style answer"];

  return (
    <div
      className={`animate-in fade-in slide-in-from-bottom-1 flex gap-3 ${user ? "justify-end" : ""}`}
    >
      {!user && (
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-cyan-50 text-emerald-700 ring-1 ring-emerald-100">
          <Bot className="h-5 w-5" />
        </div>
      )}
      <div
        className={
          user
            ? "max-w-[82%] rounded-[22px] rounded-tr-md bg-gradient-to-br from-emerald-600 to-teal-600 px-5 py-3.5 text-sm text-white shadow-sm"
            : "max-w-4xl flex-1 rounded-[24px] border border-slate-200/80 bg-white p-5 text-sm leading-7 text-slate-700 shadow-[0_8px_30px_rgba(15,23,42,.05)] sm:p-6"
        }
      >
        {user ? (
          <>
            <p>{message.content}</p>
            <p className="mt-2 flex items-center justify-end gap-1 text-[10px] text-emerald-50/80">
              {timestamp}
              <CheckCheck className="h-3 w-3" />
            </p>
          </>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="font-semibold text-[#0B1F3A]">AI Tutor</p>
                <p className="text-xs text-slate-400">
                  Cambridge exam assistant
                </p>
              </div>
              <span className="text-xs text-slate-400">{timestamp}</span>
            </div>
            {questions.length > 0 && (
              <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Verified questions", questions.length],
                  [
                    "With marking scheme",
                    questions.filter((source) => source.answerText).length,
                  ],
                  ["Relevant results", "100%"],
                  ["Ready to preview", questions.length],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-3"
                  >
                    <p className="text-lg font-bold text-[#0B1F3A]">{value}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Answer
              content={message.content}
              suppressTeacherTip={questions.length > 0}
            />
            {message.analysis&&<PaperAnalysisCard analysis={message.analysis}/>}
            {questions.length > 0 && (
              <div className="mt-5 flex gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-blue-50 p-4">
                <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                <div>
                  <p className="font-semibold text-violet-950">Teacher tip</p>
                  <p className="mt-1 text-xs leading-5 text-violet-800">
                    Read the command word first, show every calculation step,
                    and check units before comparing with the marking scheme.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
        {!user && sources.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-[#0B1F3A]">Best matches</h4>
                <p className="text-xs text-slate-400">
                  Verified from uploaded Cambridge papers
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {sources.length} sources
              </span>
            </div>
            <div className="space-y-2.5">
              {sources.slice(0, visibleSources).map((source, index) => source.sourceType==="paper"||source.sourceType==="resource" ? (
                <PaperCard key={`${source.sourceType}-${source.chunkId}`} source={source} onAction={onAction}/>
              ) : (
                <SourceCard
                  key={`${source.sourceType}-${source.chunkId}`}
                  source={source}
                  rank={index + 1}
                  generatePreview={index < Math.min(visibleSources, 3)}
                  adminDebug={adminDebug}
                  onExplain={onAction ? ()=>onAction({type:"explain_question",questionId:source.chunkId},"Explain this question") : undefined}
                />
              ))}
            </div>
            {visibleSources < sources.length && (
              <button
                onClick={() =>
                  setVisibleSources((value) =>
                    Math.min(value + 6, sources.length),
                  )
                }
                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold transition hover:border-emerald-300 hover:text-emerald-700"
              >
                View more results ({sources.length - visibleSources})
              </button>
            )}
            {message.intent==="question_search"&&message.pagination?.hasMore&&message.searchContext&&(
              <button onClick={()=>onAction?.({type:"load_more",queryState:message.searchContext!,offset:message.pagination!.offset+message.pagination!.limit,limit:message.pagination!.limit},"Load more")} className="mt-3 w-full rounded-xl bg-[#0B1F3A] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#14365e]">
                Load next {message.pagination.limit} questions ({Math.max(0,message.pagination.total-message.pagination.offset-message.pagination.limit)} remaining)
              </button>
            )}
            {message.intent!=="paper_lookup"&&<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {actions.map((label) => (
                <button
                  key={label}
                  onClick={() => onExplain?.(label)}
                  className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {label}
                </button>
              ))}
            </div>}
          </div>
        )}
      </div>
      {user && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export function AIThinkingState() {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-500">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50">
        <Bot className="h-4 w-4 text-emerald-700" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        Searching verified past-paper questions…{" "}
        <span className="inline-flex gap-1">
          <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500" />
          <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:120ms]" />
          <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:240ms]" />
        </span>
      </div>
    </div>
  );
}
