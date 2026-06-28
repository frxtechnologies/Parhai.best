import type { AiMessage as Message } from "@/api/types";
import { Bot, User } from "lucide-react";
import { useState } from "react";
import { SourceCard } from "./source-card";

function Answer({ content }: { content: string }) {
  return <div className="space-y-3">{content.split(/\n+/).filter(Boolean).map((line, i) => {
    const value = line.trim();
    const heading = value.match(/^#{1,4}\s*(?:\d+\.)?\s*(.+)$/);
    if (heading) return <section key={i} className="pt-2"><h3 className="font-semibold text-[#0B1F3A]">{heading[1]}</h3></section>;
    if (/^[-•]\s+/.test(value)) return <div key={i} className="flex gap-2"><span className="text-teal-600">•</span><span>{value.replace(/^[-•]\s+/, "")}</span></div>;
    return <p key={i}>{value}</p>;
  })}</div>;
}

export function AIMessage({ message, onExplain }: { message: Message; onExplain?: (prompt: string) => void }) {
  const user = message.role === "user";
  const [visibleSources, setVisibleSources] = useState(6);
  const sources = message.sources ?? [];
  return <div className={`animate-in fade-in slide-in-from-bottom-1 flex gap-3 ${user ? "justify-end" : ""}`}>
    {!user && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Bot className="h-4 w-4" /></div>}
    <div className={user ? "max-w-[78%] rounded-2xl rounded-tr-md bg-[#0B1F3A] px-4 py-3 text-sm text-white" : "max-w-3xl flex-1 rounded-2xl bg-white p-5 text-sm leading-7 text-slate-700 shadow-sm ring-1 ring-slate-200"}>
      {user ? message.content : <Answer content={message.content} />}
      {!user && sources.length > 0 && <div className="mt-5 border-t pt-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Verified sources</h4>
        <div className="grid gap-2 sm:grid-cols-2">{sources.slice(0, visibleSources).map((source, index) =>
          <SourceCard key={`${source.sourceType}-${source.chunkId}`} source={source} generatePreview={index < visibleSources}
            onExplain={onExplain ? () => onExplain(`Explain Question ${source.questionNumber ?? ""} from ${source.reference.replace(/^\[S\d+\]\s*/, "")}.`) : undefined} />)}
        </div>
        {visibleSources < sources.length && <button onClick={() => setVisibleSources((value) => Math.min(value + 6, sources.length))}
          className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">Load more questions</button>}
      </div>}
    </div>
    {user && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600"><User className="h-4 w-4" /></div>}
  </div>;
}

export function AIThinkingState() {
  return <div className="flex items-center gap-3 text-sm text-slate-500"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50"><Bot className="h-4 w-4 text-teal-700" /></div><div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">Thinking <span className="inline-flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:240ms]" /></span></div></div>;
}
