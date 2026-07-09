import type { AiMessage as Message } from "@/api/types";
import { Bot, CheckCheck, ChevronDown, Copy, Lightbulb } from "lucide-react";
import { useState } from "react";
import { SourceCard } from "./source-card";

function renderInline(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) result.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    if (m[0].startsWith("**")) {
      result.push(<strong key={key++} className="font-semibold text-slate-900">{m[0].slice(2, -2)}</strong>);
    } else {
      result.push(
        <code key={key++} className="rounded-md border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 font-mono text-[0.85em] text-indigo-600">
          {m[0].slice(1, -1)}
        </code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) result.push(<span key={key++}>{text.slice(last)}</span>);
  return result;
}

function Answer({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { code.push(lines[i]); i++; }
      nodes.push(
        <div key={key++} className="my-4 overflow-hidden rounded-xl border border-slate-800 bg-[#0D1117]">
          {lang && (
            <div className="border-b border-slate-800 px-4 py-2">
              <span className="font-mono text-[11px] text-slate-500">{lang}</span>
            </div>
          )}
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-slate-200">{code.join("\n")}</pre>
        </div>
      );
      i++; continue;
    }

    // H2
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      nodes.push(
        <h2 key={key++} className="mb-2 mt-6 border-b border-slate-100 pb-2 text-base font-bold text-[#1E1B4B]">
          {renderInline(h2[1])}
        </h2>
      );
      i++; continue;
    }

    // H3
    const h3 = line.match(/^###?\s+(.+)$/);
    if (h3) {
      nodes.push(
        <h3 key={key++} className="mb-1 mt-4 text-sm font-bold text-[#1E1B4B]">
          {renderInline(h3[1])}
        </h3>
      );
      i++; continue;
    }

    // Numbered list
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\d+[.)]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      nodes.push(
        <ol key={key++} className="my-3 space-y-2 pl-1">
          {items.map((text, n) => (
            <li key={n} className="flex gap-3 text-sm leading-6">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-[10px] text-indigo-600">
                {n + 1}
              </span>
              <span>{renderInline(text)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Bullet list
    if (/^[-•*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-•*]\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={key++} className="my-3 space-y-1.5">
          {items.map((text, n) => (
            <li key={n} className="flex gap-2.5 text-sm leading-6">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              <span>{renderInline(text)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    nodes.push(
      <p key={key++} className="text-sm leading-7 text-slate-700">{renderInline(line)}</p>
    );
    i++;
  }

  return <div className="space-y-1">{nodes}</div>;
}

export function AIMessage({ message, onExplain }: { message: Message; onExplain?: (prompt: string) => void }) {
  const isUser = message.role === "user";
  const [showAllSources, setShowAllSources] = useState(false);
  const [copied, setCopied] = useState(false);
  const sources = message.sources ?? [];
  const questions = sources.filter(s => s.sourceType === "question");
  const timestamp = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const visibleSources = showAllSources ? sources : sources.slice(0, 3);

  const copyContent = () => {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── User bubble ──
  if (isUser) {
    return (
      <div className="flex items-end justify-end gap-2.5">
        <div className="max-w-[78%] md:max-w-[65%]">
          <div className="rounded-3xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-3.5 shadow-lg shadow-indigo-500/15">
            <p className="text-sm leading-6 text-white">{message.content}</p>
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 pr-1">
            <span className="text-[10px] text-slate-400">{timestamp}</span>
            <CheckCheck className="h-3 w-3 text-indigo-400" />
          </div>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 font-bold text-xs text-white shadow-md shadow-indigo-500/25">
          U
        </div>
      </div>
    );
  }

  // ── AI response ──
  return (
    <div className="flex items-start gap-3">
      {/* Bot avatar */}
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25">
        <Bot className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1 max-w-[calc(100%-3.5rem)]">
        {/* Main card */}
        <div className="rounded-3xl rounded-tl-md border border-slate-200/60 bg-white p-5 shadow-[0_4px_24px_rgba(99,102,241,0.06)] sm:p-6">
          {/* Card header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1E1B4B]">AI Tutor</span>
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 font-semibold text-[10px] text-indigo-600">
                Cambridge
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400">{timestamp}</span>
              <button
                onClick={copyContent}
                title="Copy response"
                className="ml-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <Copy className={`h-3.5 w-3.5 ${copied ? "text-indigo-500" : ""}`} />
              </button>
            </div>
          </div>

          {/* Stats row */}
          {questions.length > 0 && (
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["Verified questions", questions.length, "text-indigo-600", "bg-indigo-50"],
                ["With marking scheme", questions.filter(s => s.answerText).length, "text-emerald-600", "bg-emerald-50"],
                ["Relevance", "100%", "text-violet-600", "bg-violet-50"],
                ["Ready to use", questions.length, "text-orange-500", "bg-orange-50"],
              ] as const).map(([label, value, textCls, bgCls]) => (
                <div key={label} className={`rounded-xl ${bgCls} px-3 py-3`}>
                  <p className={`text-lg font-bold ${textCls}`}>{value}</p>
                  <p className="font-medium uppercase tracking-wide text-[10px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Answer */}
          <Answer content={message.content} />

          {/* Examiner tip */}
          {questions.length > 0 && (
            <div className="mt-5 flex gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-4">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
              <div>
                <p className="font-bold text-[12px] text-indigo-900">Examiner tip</p>
                <p className="mt-0.5 text-[12px] leading-5 text-indigo-700">
                  Read command words carefully, show all working, and compare every step against the marking scheme.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sources */}
        {sources.length > 0 && (
          <div className="mt-3 rounded-2xl border border-slate-200/60 bg-white/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13px] text-[#1E1B4B]">Sources</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-[10px] text-slate-600">
                  {sources.length}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">Verified Cambridge papers</span>
            </div>
            <div className="space-y-2">
              {visibleSources.map((source, idx) => (
                <SourceCard
                  key={`${source.sourceType}-${source.chunkId}`}
                  source={source}
                  rank={idx + 1}
                  generatePreview={idx < (showAllSources ? sources.length : 3)}
                  onExplain={
                    onExplain
                      ? () => onExplain(`Explain Question ${source.questionNumber ?? ""} from ${source.reference.replace(/^\[S\d+\]\s*/, "")}.`)
                      : undefined
                  }
                />
              ))}
            </div>
            {sources.length > 3 && (
              <button
                onClick={() => setShowAllSources(v => !v)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 font-semibold text-xs text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
              >
                {showAllSources ? "Show fewer" : `View ${sources.length - 3} more results`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllSources ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AIThinkingState() {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-3xl rounded-tl-md border border-slate-200/60 bg-white px-5 py-4 shadow-[0_4px_24px_rgba(99,102,241,0.06)]">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-bold text-sm text-[#1E1B4B]">AI Tutor</span>
          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 font-semibold text-[10px] text-indigo-600">Cambridge</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Searching verified past papers</span>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce-dot"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
