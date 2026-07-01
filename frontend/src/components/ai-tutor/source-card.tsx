import type { AiSource } from "@/api/types";
import { API_BASE_URL } from "@/api/client";
import { requireSupabase } from "@/lib/supabase";
import { Bookmark, CheckCircle2, ExternalLink, FileCheck2 } from "lucide-react";
import { useEffect, useState } from "react";

export function SourceCard({
  source,
  onExplain,
  generatePreview = false,
  rank,
  adminDebug = false,
}: {
  source: AiSource;
  onExplain?: (source: AiSource) => void;
  generatePreview?: boolean;
  rank?: number;
  adminDebug?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState(source.screenshotUrl ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(source.screenshotStatus === "failed");
  const [screenshotStatus, setScreenshotStatus] = useState(
    source.screenshotStatus ?? null,
  );
  const [adminErrorReason, setAdminErrorReason] = useState<string | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [schemePreviewUrl,setSchemePreviewUrl]=useState<string|null>(null);
  const [schemeLoading,setSchemeLoading]=useState(false);
  const [saved,setSaved]=useState(false);
  const [practiced,setPracticed]=useState(false);

  async function generateScreenshot() {
    if (source.sourceType !== "question" || !source.chunkId) return;
    setLoading(true);
    setFailed(false);
    setAdminErrorReason(null);
    try {
      const { data } = await requireSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("auth_missing");
      const response = await fetch(
        `${API_BASE_URL}/api/questions/${source.chunkId}/screenshot`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          reason?: string;
        } | null;
        setAdminErrorReason(body?.reason ?? "render_failed");
        throw new Error(body?.reason ?? "render_failed");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("render_failed");
      setScreenshotStatus(
        response.headers.get("X-Screenshot-Status") ?? "generated",
      );
      setImageFailed(false);
      setPreviewUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      setFailed(false);
    } catch (error) {
      setAdminErrorReason(
        error instanceof Error ? error.message : "render_failed",
      );
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      !previewUrl &&
      generatePreview &&
      source.sourceType === "question" &&
      !failed
    )
      void generateScreenshot();
    // Source identity and card visibility are stable after mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatePreview, source.chunkId]);

  useEffect(() => {
    setPreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return source.screenshotUrl ?? null;
    });
    setFailed(
      source.screenshotStatus === "failed" ||
        source.screenshotStatus === "failed_page_match",
    );
    setScreenshotStatus(source.screenshotStatus ?? null);
    setAdminErrorReason(null);
  }, [source.chunkId, source.screenshotStatus, source.screenshotUrl]);

  useEffect(
    () => () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      if (schemePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(schemePreviewUrl);
    },
    [previewUrl,schemePreviewUrl],
  );

  async function viewResource() {
    if (!source.resourceId) return;
    setPdfFailed(false);
    const { data } = await requireSupabase().auth.getSession();
    const response = await fetch(
      `${API_BASE_URL}/api/resources/${source.resourceId}/view-url`,
      {
        headers: {
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
      },
    );
    const body = (await response.json()) as { url?: string };
    if (response.ok && body.url)
      window.open(body.url, "_blank", "noopener,noreferrer");
    else setPdfFailed(true);
  }

  async function viewMarkingSchemePdf() {
    if (!source.markingSchemeResourceId) return;
    const { data } = await requireSupabase().auth.getSession();
    const response = await fetch(
      `${API_BASE_URL}/api/resources/${source.markingSchemeResourceId}/view-url`,
      { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } },
    );
    const body = (await response.json()) as { url?: string };
    if (response.ok && body.url)
      window.open(body.url, "_blank", "noopener,noreferrer");
  }

  async function loadSchemePreview(){
    if(!source.chunkId)return;setSchemeLoading(true);
    try{
      const{data}=await requireSupabase().auth.getSession();
      const response=await fetch(`${API_BASE_URL}/api/questions/${source.chunkId}/marking-scheme/screenshot`,{headers:{Authorization:`Bearer ${data.session?.access_token??""}`}});
      if(!response.ok)throw new Error("unavailable");
      const blob=await response.blob();setSchemePreviewUrl(URL.createObjectURL(blob));
    }finally{setSchemeLoading(false)}
  }

  async function recordActivity(activity_type:"saved"|"completed"){
    const{data}=await requireSupabase().auth.getSession();
    const response=await fetch(`${API_BASE_URL}/api/exam-engine/activity`,{method:"POST",headers:{Authorization:`Bearer ${data.session?.access_token??""}`,"Content-Type":"application/json"},body:JSON.stringify({question_id:source.chunkId,activity_type,source:"ai_tutor"})});
    if(response.ok){if(activity_type==="saved")setSaved(true);else setPracticed(true)}
  }

  const subjectLabel =
    source.reference
      .replace(/^\[S\d+\]\s*/, "")
      .split(" · ")[0]
      ?.trim() || "Cambridge";
  const sessionLabel =
    source.session
      ?.replace("_", " ")
      .replace("MAY JUNE", "May/June")
      .replace("OCT NOV", "Oct/Nov") ?? "Session";
  const shortTitle = `${subjectLabel} · ${source.year ?? "Year"} ${sessionLabel} · Paper ${source.paperNumber ?? "—"} Variant ${source.variant ?? "—"} · Q${source.questionNumber ?? "—"}`;

  const schemeLabel =
    ["partial", "linked_partial"].includes(source.markingSchemeLinkStatus ?? "")
      ? "Partial marking scheme match"
      : source.answerText ||
          ["linked", "linked_exact"].includes(source.markingSchemeLinkStatus ?? "")
        ? "Marking scheme available"
        : source.markingSchemeResourceId
          ? "Marking scheme preview pending"
          : "Marking scheme not linked yet";
  return (
    <article className="animate-in fade-in slide-in-from-bottom-1 rounded-[22px] border border-slate-200/80 bg-white p-4 transition hover:border-emerald-200 hover:shadow-[0_12px_32px_rgba(15,23,42,.07)]">
      {rank && (
        <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0B1F3A] text-xs font-bold text-white">
          {rank}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-semibold text-[#0B1F3A]"
            title={shortTitle}
          >
            {shortTitle}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {source.year ?? "Year unavailable"} ·{" "}
            {source.session?.replace("_", " ") ?? "Session unavailable"}
            {source.questionNumber
              ? ` · Question ${source.questionNumber}`
              : ""}
          </p>
        </div>
        <FileCheck2 className="h-4 w-4 shrink-0 text-teal-600" />
      </div>

      {previewUrl && !imageFailed ? (
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block overflow-hidden rounded-2xl border bg-white"
        >
          <img
            onError={() => setImageFailed(true)}
            src={previewUrl}
            alt={`Question ${source.questionNumber ?? ""}`}
            className="h-72 w-full object-contain p-2 sm:h-80"
          />
        </a>
      ) : loading ? (
        <p className="mt-3 animate-pulse rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Generating preview…
        </p>
      ) : failed ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Preview unavailable — open PDF instead.
        </p>
      ) : source.questionText ? (
        <div className="mt-3 rounded-xl border bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Question text preview
          </p>
          <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {source.questionText}
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Preview unavailable — open PDF instead.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {source.topic && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
            {source.topic}
          </span>
        )}
        {source.subtopic && (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
            {source.subtopic}
          </span>
        )}
        {source.difficulty && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {source.difficulty}
          </span>
        )}
        {source.marks != null && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {source.marks} marks
          </span>
        )}
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${schemeLabel === "Marking scheme available" ? "bg-emerald-50 text-emerald-700" : schemeLabel === "Partial marking scheme match" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}
        >
          {schemeLabel}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {previewUrl && !imageFailed && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
          >
            <ExternalLink className="h-3 w-3" />
            Open large preview
          </a>
        )}
        {adminDebug && !previewUrl && source.sourceType === "question" && !loading && (
          <button
            onClick={() => void generateScreenshot()}
            className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            Generate screenshot
          </button>
        )}
        {source.paperId ? (
          <a
            href={`/papers/${source.paperId}/view`}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
          >
            View PDF
          </a>
        ) : source.resourceId ? (
          <button
            onClick={() => void viewResource()}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
          >
            View PDF
          </button>
        ) : null}
      {onExplain && (
          <button
            onClick={() => onExplain(source)}
            className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700"
          >
            Explain
          </button>
      )}
      {(source.answerText||source.markingSchemeResourceId)&&!schemePreviewUrl&&<button disabled={schemeLoading} onClick={()=>void loadSchemePreview()} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">{schemeLoading?"Loading scheme…":"View marking scheme screenshot"}</button>}
      {source.markingSchemeResourceId&&<button onClick={()=>void viewMarkingSchemePdf()} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold">View marking scheme PDF</button>}
      {source.sourceType==="question"&&<button onClick={()=>void recordActivity("completed")} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><CheckCircle2 className="h-3 w-3"/>{practiced?"Practiced":"Mark practiced"}</button>}
      {source.sourceType==="question"&&<button onClick={()=>void recordActivity("saved")} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><Bookmark className={`h-3 w-3 ${saved?"fill-current text-cyan-600":""}`}/>{saved?"Saved":"Bookmark"}</button>}
    </div>
    {schemePreviewUrl&&<a href={schemePreviewUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50"><img src={schemePreviewUrl} alt={`Marking scheme for question ${source.questionNumber??""}`} className="max-h-72 w-full object-contain"/></a>}
      {source.questionText && (
        <details className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">
          <summary className="cursor-pointer font-semibold">
            View question text
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{source.questionText}</p>
        </details>
      )}
      {source.answerText && (
        <details className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">
          <summary className="cursor-pointer font-semibold">
            View marking scheme
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{source.answerText}</p>
        </details>
      )}
      {source.sourceType === "question" && !source.answerText && !source.markingSchemeResourceId && (
        <p className="mt-2 px-1 text-xs text-slate-400">
          Marking scheme not linked yet
        </p>
      )}
      {adminDebug && (
        <details className="mt-2 rounded-lg border border-dashed p-2 text-[11px] text-slate-500">
          <summary className="cursor-pointer font-semibold">
            Admin diagnostics
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-all">
            {JSON.stringify(
              {
                question_id: source.chunkId,
                resource_id: source.resourceId,
                source_page: source.sourcePage,
                bbox: source.bbox,
                screenshot_status: failed ? "failed" : screenshotStatus,
                file_path: source.filePath,
                confidence: source.confidence,
                needs_review: source.needsReview,
                screenshot_error: adminErrorReason ?? source.screenshotError,
                page_match_score: source.pageMatchScore,
                fallback_used: source.screenshotFallbackUsed,
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}
      {pdfFailed && (
        <p className="mt-2 text-xs text-slate-500">
          The source PDF is temporarily unavailable.
        </p>
      )}
      {(source.topic || source.difficulty || source.marks != null) && (
        <p className="mt-2 text-xs text-slate-500">
          {[
            source.topic,
            source.subtopic,
            source.difficulty,
            source.marks != null ? `${source.marks} marks` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </article>
  );
}
