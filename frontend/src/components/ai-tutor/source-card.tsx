import type { AiSource } from "@/api/types";
import { ExternalLink, FileCheck2 } from "lucide-react";

export function SourceCard({source}:{source:AiSource}){
  return <article className="animate-in fade-in slide-in-from-bottom-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-[#0B1F3A]">{source.reference.replace(/^\[S\d+\]\s*/,"")}</p><p className="mt-1 text-xs text-slate-400">{source.year??"Year unavailable"} · {source.session?.replace("_"," ")??"Session unavailable"}{source.questionNumber?` · Question ${source.questionNumber}`:""}</p></div><FileCheck2 className="h-4 w-4 shrink-0 text-teal-600"/></div>
    <div className="mt-3 flex flex-wrap gap-2">{source.screenshotUrl&&<a href={source.screenshotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><ExternalLink className="h-3 w-3"/>View question</a>}{source.answerText&&<button className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold">View marking scheme</button>}</div>
  </article>
}
