import type { AiSource } from "@/api/types";
import { API_BASE_URL, useIsAdmin } from "@/api/client";
import { requireSupabase } from "@/lib/supabase";
import { ExternalLink, FileCheck2 } from "lucide-react";
import { useEffect, useState } from "react";

export function SourceCard({ source, onExplain, generatePreview = false, rank }: {
  source: AiSource;
  onExplain?: (source: AiSource) => void;
  generatePreview?: boolean;
  rank?: number;
}) {
  const [previewUrl, setPreviewUrl] = useState(source.screenshotUrl ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(source.screenshotStatus === "failed");
  const { isAdmin } = useIsAdmin();

  async function generateScreenshot() {
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await requireSupabase().auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/questions/${source.chunkId}/screenshot`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      if (!response.ok) throw new Error("Preview unavailable");
      setPreviewUrl(URL.createObjectURL(await response.blob()));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!previewUrl && generatePreview && source.sourceType === "question" && !failed) void generateScreenshot();
    // Source identity and card visibility are stable after mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatePreview, source.chunkId]);

  async function viewResource() {
    if (!source.resourceId) return;
    const { data } = await requireSupabase().auth.getSession();
    const response = await fetch(`${API_BASE_URL}/api/resources/${source.resourceId}/view-url`, {
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    });
    const body = await response.json() as { url?: string };
    if (response.ok && body.url) window.open(body.url, "_blank", "noopener,noreferrer");
  }

  return <article className="animate-in fade-in slide-in-from-bottom-1 rounded-2xl border border-slate-200/80 bg-white p-3 transition hover:border-emerald-200 hover:shadow-[0_8px_24px_rgba(15,23,42,.05)]">
    {rank && <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0B1F3A] text-xs font-bold text-white">{rank}</span>}
    <div className="flex items-start justify-between gap-2">
      <div><p className="text-sm font-semibold text-[#0B1F3A]">{source.reference.replace(/^\[S\d+\]\s*/, "")}</p>
        <p className="mt-1 text-xs text-slate-400">{source.year ?? "Year unavailable"} · {source.session?.replace("_", " ") ?? "Session unavailable"}{source.questionNumber ? ` · Question ${source.questionNumber}` : ""}</p></div>
      <FileCheck2 className="h-4 w-4 shrink-0 text-teal-600" />
    </div>

    {previewUrl
      ? <img src={previewUrl} alt={`Question ${source.questionNumber ?? ""}`} className="mt-3 max-h-52 w-full rounded-lg border bg-slate-50 object-contain" />
      : loading
        ? <p className="mt-3 animate-pulse rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Generating preview…</p>
        : failed
          ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Preview unavailable — open PDF instead.</p>
          : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Screenshot not generated yet.</p>}

    <div className="mt-3 flex flex-wrap gap-2">
      {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><ExternalLink className="h-3 w-3" />View preview</a>}
      {!previewUrl && source.sourceType === "question" && !loading && <button onClick={() => void generateScreenshot()} className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white">Generate screenshot</button>}
      {source.paperId ? <a href={`/papers/${source.paperId}/view`} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold">View PDF</a> : source.resourceId ? <button onClick={() => void viewResource()} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold">View PDF</button> : null}
      {onExplain && <button onClick={() => onExplain(source)} className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700">Explain</button>}
    </div>
    {source.questionText && <details className="mt-2 rounded-lg bg-slate-50 p-2 text-xs"><summary className="cursor-pointer font-semibold">View question text</summary><p className="mt-2 whitespace-pre-wrap">{source.questionText}</p></details>}
    {source.answerText && <details className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900"><summary className="cursor-pointer font-semibold">View marking scheme</summary><p className="mt-2 whitespace-pre-wrap">{source.answerText}</p></details>}
    {source.sourceType === "question" && !source.answerText && <p className="mt-2 px-1 text-xs text-slate-400">Marking scheme not linked yet</p>}
    {isAdmin && <details className="mt-2 rounded-lg border border-dashed p-2 text-[11px] text-slate-500"><summary className="cursor-pointer font-semibold">Screenshot debug</summary><pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify({
      question_id: source.chunkId, resource_id: source.resourceId, source_page: source.sourcePage,
      bbox: source.bbox, screenshot_status: failed ? "failed" : source.screenshotStatus, file_path: source.filePath,
      confidence: source.confidence, needs_review: source.needsReview,
    }, null, 2)}</pre></details>}
    {(source.topic || source.difficulty || source.marks != null) && <p className="mt-2 text-xs text-slate-500">{[source.topic, source.subtopic, source.difficulty, source.marks != null ? `${source.marks} marks` : null].filter(Boolean).join(" · ")}</p>}
  </article>;
}
