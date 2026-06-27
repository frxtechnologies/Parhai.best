import type { AiSource } from "@/api/types";
import { API_BASE_URL } from "@/api/client";
import { requireSupabase } from "@/lib/supabase";
import { ExternalLink, FileCheck2 } from "lucide-react";

export function SourceCard({ source, onExplain }: { source: AiSource; onExplain?: (source: AiSource) => void }) {
  async function viewResource() {
    if (!source.resourceId) return;
    const { data } = await requireSupabase().auth.getSession();
    const response = await fetch(`${API_BASE_URL}/api/resources/${source.resourceId}/view-url`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
    const body = await response.json() as { url?: string };
    if (response.ok && body.url) window.open(body.url, "_blank", "noopener,noreferrer");
  }
  return <article className="animate-in fade-in slide-in-from-bottom-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-[#0B1F3A]">{source.reference.replace(/^\[S\d+\]\s*/, "")}</p><p className="mt-1 text-xs text-slate-400">{source.year ?? "Year unavailable"} · {source.session?.replace("_", " ") ?? "Session unavailable"}{source.questionNumber ? ` · Question ${source.questionNumber}` : ""}</p></div><FileCheck2 className="h-4 w-4 shrink-0 text-teal-600" /></div>
    {source.screenshotUrl ? <img src={source.screenshotUrl} alt={`Question ${source.questionNumber ?? ""}`} className="mt-3 max-h-52 w-full rounded-lg border bg-slate-50 object-contain" /> : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Screenshot not generated yet.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {source.screenshotUrl && <a href={source.screenshotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><ExternalLink className="h-3 w-3" />View full question</a>}
      {source.paperId ? <a href={`/papers/${source.paperId}/view`} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold">View PDF</a> : source.resourceId ? <button onClick={() => void viewResource()} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold">View PDF</button> : null}
      {onExplain && <button onClick={() => onExplain(source)} className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700">Explain</button>}
    </div>
    {source.answerText && <details className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900"><summary className="cursor-pointer font-semibold">View marking scheme</summary><p className="mt-2 whitespace-pre-wrap">{source.answerText}</p></details>}
    {(source.topic || source.difficulty || source.marks != null) && <p className="mt-2 text-xs text-slate-500">{[source.topic, source.subtopic, source.difficulty, source.marks != null ? `${source.marks} marks` : null].filter(Boolean).join(" · ")}</p>}
  </article>;
}
