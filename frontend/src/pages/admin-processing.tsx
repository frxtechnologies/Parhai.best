import { API_BASE_URL, requestResourceProcessing } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { isAdminEmail } from "@/config/admin";
import { useAuth } from "@/context/auth-context";
import { requireSupabase } from "@/lib/supabase";
import { Eye, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Redirect } from "wouter";

type Job = {
  id: number;
  status: string;
  error_message: string | null;
  retry_count: number;
  updated_at: string;
  progress_percent: number;
  current_step: string | null;
};
type Resource = {
  id: number;
  title: string;
  original_filename: string;
  bucket: string;
  storage_path: string;
  resource_type: string;
  processing_status: string;
  processing_error: string | null;
  extracted_text_length: number;
  detected_question_count: number;
  saved_question_count: number;
  topic_tagging_status: string | null;
  marking_scheme_link_status: string | null;
  subjects: { name: string } | null;
  processing_jobs: Job[];
  question_index: Array<{ count: number }>;
};
type IndexedQuestion = {
  id: number;
  question_number: string;
  topic: string;
  subtopic: string | null;
  difficulty: string;
  marks: number | null;
  question_text: string;
  answer_text: string | null;
  source_page: number | null;
  crop_status: string;
  screenshot_status: string;
  question_screenshot_url: string | null;
  question_images: Array<{
    id: number;
    image_url: string;
    page_number: number;
    image_order: number;
    needs_review: boolean;
  }>;
};

export default function AdminProcessing() {
  const { user, isLoading } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [questions, setQuestions] = useState<Record<number, IndexedQuestion[]>>(
    {},
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [aiHealth,setAiHealth]=useState<any>(null);

  async function load() {
    const { data, error } = await requireSupabase()
      .from("resources")
      .select(
        "id,title,original_filename,bucket,storage_path,resource_type,processing_status,processing_error,extracted_text_length,detected_question_count,saved_question_count,topic_tagging_status,marking_scheme_link_status,subjects(name),processing_jobs(id,status,error_message,retry_count,progress_percent,current_step,updated_at),question_index(count)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as unknown as Resource[];
    rows.forEach((row) =>
      row.processing_jobs.sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      ),
    );
    setResources(rows);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error.message));
  }, []);
  useEffect(()=>{
    if(!isAdminEmail(user?.email))return;
    void authHeader().then(headers=>fetch(`${API_BASE_URL}/api/admin/ai-health`,{headers}))
      .then(response=>response.ok?response.json():null).then(setAiHealth).catch(()=>undefined);
  },[user?.email]);
  if (isLoading)
    return (
      <AppLayout>
        <div />
      </AppLayout>
    );
  if (!isAdminEmail(user?.email)) return <Redirect to="/dashboard" />;

  async function authHeader() {
    const { data } = await requireSupabase().auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }

  async function retry(resourceId: number) {
    setBusy(resourceId);
    setMessage("");
    const headers = await authHeader();
    const response = await requestResourceProcessing(
      resourceId,
      headers.Authorization.replace("Bearer ", ""),
    );
    const body = (response.status === 202 ? {} : await response.json()) as {
      indexedQuestions?: number;
      linkedAnswers?: number;
      chunks?: number;
      error?: string;
    };
    setMessage(
      response.status === 202
        ? "Processing queued in the background."
        : response.ok
          ? `Completed: ${body.chunks ?? 0} chunks, ${body.indexedQuestions ?? 0} questions, ${body.linkedAnswers ?? 0} linked answers.`
          : (body.error ?? "Processing failed."),
    );
    setBusy(null);
    await load();
  }

  async function selective(resourceId:number,mode:"topic-tags"|"question-types"|"marking-scheme-links"|"embeddings"){
    setBusy(resourceId);setMessage("");
    try{
      const response=await fetch(`${API_BASE_URL}/api/resources/${resourceId}/reprocess/${mode}`,{method:"POST",headers:await authHeader()});
      const body=await response.json();if(!response.ok)throw new Error(body.error??"Reprocessing failed.");
      setMessage(`${mode.replace(/-/g," ")} completed for resource ${resourceId}.`);await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Reprocessing failed.")}
    finally{setBusy(null)}
  }

  async function viewQuestions(resourceId: number) {
    if (questions[resourceId]) {
      setQuestions((current) => {
        const next = { ...current };
        delete next[resourceId];
        return next;
      });
      return;
    }
    const response = await fetch(
      `${API_BASE_URL}/api/resources/${resourceId}/questions`,
      { headers: await authHeader() },
    );
    const body = (await response.json()) as {
      questions?: IndexedQuestion[];
      error?: string;
    };
    if (!response.ok) {
      setMessage(body.error ?? "Could not load extracted questions.");
      return;
    }
    setQuestions((current) => ({
      ...current,
      [resourceId]: body.questions ?? [],
    }));
  }

  async function reviewCrop(
    resourceId: number,
    questionId: number,
    status: "correct" | "incorrect",
  ) {
    const response = await fetch(
      `${API_BASE_URL}/api/questions/${questionId}/crop-review`,
      {
        method: "PATCH",
        headers: {
          ...(await authHeader()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(body.error ?? "Could not save crop review.");
      return;
    }
    setQuestions((current) => ({
      ...current,
      [resourceId]: (current[resourceId] ?? []).map((question) =>
        question.id === questionId
          ? { ...question, crop_status: status }
          : question,
      ),
    }));
    setMessage(`Question crop marked ${status}.`);
  }

  async function generateScreenshots(resourceId: number, questionId?: number) {
    setBusy(questionId ?? resourceId);
    const response = await fetch(questionId
      ? `${API_BASE_URL}/api/questions/${questionId}/screenshot`
      : `${API_BASE_URL}/api/resources/${resourceId}/screenshots`, {
      method: "POST", headers: await authHeader(),
    });
    const body = await response.json() as { screenshots?: number; failed?: number; fullPageFallbacks?: number; error?: string };
    setMessage(response.ok
      ? `Screenshots: ${body.screenshots ?? 0} saved, ${body.fullPageFallbacks ?? 0} full-page fallbacks, ${body.failed ?? 0} failed.`
      : body.error ?? "Screenshot generation failed.");
    setBusy(null);
    if (response.ok) {
      setQuestions((current) => { const next = { ...current }; delete next[resourceId]; return next; });
      await viewQuestions(resourceId);
      await load();
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-[#0B1F3A]">
            Automatic processing jobs
          </h1>
          <p className="text-gray-500">
            Extraction, question indexing, screenshot crops, topic tagging,
            embeddings, and marking-scheme links.
          </p>
        </header>
        {message && (
          <div className="rounded-xl border bg-cyan-50 p-4 text-sm text-[#0B1F3A]">
            {message}
          </div>
        )}
        {aiHealth&&<section className="rounded-2xl border bg-white p-5">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-700">AI data health</p><h2 className="mt-1 text-2xl font-bold text-[#0B1F3A]">{aiHealth.coverage.healthPercent}% ready</h2></div><p className="text-xs text-slate-400">Last evaluated {new Date(aiHealth.coverage.generatedAt).toLocaleString()}</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
            ["Indexed",aiHealth.coverage.totals.indexedQuestions],["Verified",aiHealth.coverage.totals.verifiedQuestions],
            ["Valid MS links",aiHealth.links.validLinks],["Invalid links",aiHealth.links.invalidLinks],
            ["Unknown types",aiHealth.coverage.totals.unknownQuestionTypes],
          ].map(([label,value])=><div key={String(label)} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><b className="text-xl text-[#0B1F3A]">{value}</b></div>)}</div>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-slate-500"><th>Subject</th><th>Questions</th><th>Verified</th><th>Linked</th><th>Unknown type</th><th>Missing preview</th></tr></thead><tbody>{aiHealth.coverage.subjects.map((row:any)=><tr key={row.syllabusCode} className="border-t"><td className="py-2 font-semibold">{row.subjectName} {row.syllabusCode}</td><td>{row.indexedQuestions}</td><td>{row.verifiedQuestions}</td><td>{row.linkedQuestions}</td><td>{row.unknownQuestionTypes}</td><td>{row.missingPreviews}</td></tr>)}</tbody></table></div>
        </section>}
        <section className="divide-y overflow-hidden rounded-2xl border bg-white">
          {resources.map((resource) => {
            const job = resource.processing_jobs[0];
            const open = questions[resource.id];
            return (
              <article key={resource.id} className="p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[#0B1F3A]">{resource.title}</b>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                        {resource.resource_type}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${job?.status === "completed" ? "bg-emerald-100 text-emerald-700" : job?.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                      >
                        {job?.status ?? resource.processing_status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {resource.subjects?.name} ·{" "}
                      {resource.question_index[0]?.count ?? 0} indexed questions
                      · retries {job?.retry_count ?? 0}
                    </p>
                    {job&&job.status!=="completed"&&<div className="mt-2 max-w-md"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-cyan-500" style={{width:`${job.progress_percent??0}%`}}/></div><p className="mt-1 text-xs text-slate-500">{job.current_step?.replace(/_/g," ")??job.status} · {job.progress_percent??0}%</p></div>}
                    {(job?.error_message || resource.processing_error) && (
                      <p className="mt-2 text-xs text-red-600">
                        {job?.error_message || resource.processing_error}
                      </p>
                    )}
                    <details className="mt-2 text-xs text-slate-500">
                      <summary className="cursor-pointer font-semibold">
                        Processing diagnostics
                      </summary>
                      <dl className="mt-2 grid gap-x-5 gap-y-1 sm:grid-cols-2">
                        <div>resource_id: {resource.id}</div>
                        <div>file_name: {resource.original_filename}</div>
                        <div className="break-all sm:col-span-2">
                          file_path: {resource.bucket}/{resource.storage_path}
                        </div>
                        <div>
                          extracted_text_length: {resource.extracted_text_length}
                        </div>
                        <div>
                          detected_question_count:{" "}
                          {resource.detected_question_count}
                        </div>
                        <div>
                          saved_question_count: {resource.saved_question_count}
                        </div>
                        <div>
                          topic_tagging_status:{" "}
                          {resource.topic_tagging_status ?? "not recorded"}
                        </div>
                        <div>
                          marking_scheme_link_status:{" "}
                          {resource.marking_scheme_link_status ?? "not recorded"}
                        </div>
                      </dl>
                    </details>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button disabled={busy===resource.id} onClick={()=>selective(resource.id,"topic-tags")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Retag topics</button>
                    <button disabled={busy===resource.id} onClick={()=>selective(resource.id,"question-types")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Reclassify types</button>
                    <button disabled={busy===resource.id} onClick={()=>selective(resource.id,"marking-scheme-links")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Relink MS</button>
                    <button disabled={busy===resource.id} onClick={()=>selective(resource.id,"embeddings")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Rebuild embeddings</button>
                    <button disabled={busy === resource.id} onClick={() => generateScreenshots(resource.id)}
                      className="rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 disabled:opacity-50">
                      Generate screenshots
                    </button>
                    <button
                      onClick={() => viewQuestions(resource.id)}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <Eye className="h-4 w-4" />
                      Review questions
                    </button>
                    <button
                      disabled={busy === resource.id}
                      onClick={() => retry(resource.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {busy === resource.id ? "Processing…" : "Retry"}
                    </button>
                  </div>
                </div>
                {open && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <div className="grid gap-2 sm:grid-cols-4">
                      {["generated", "failed", "pending", "full_page_fallback"].map((status) => (
                        <div key={status} className="rounded-lg bg-slate-50 p-2 text-xs">
                          <b>{open.filter((q) => q.screenshot_status === status).length}</b> {status.replace(/_/g, " ")}
                        </div>
                      ))}
                    </div>
                    {open.map((question) => (
                      <details
                        key={question.id}
                        className="rounded-xl border p-4"
                      >
                        <summary className="cursor-pointer font-semibold">
                          Q{question.question_number} · {question.topic}
                          {question.subtopic
                            ? ` / ${question.subtopic}`
                            : ""} · {question.difficulty} ·{" "}
                          <span
                            className={
                              question.crop_status === "correct"
                                ? "text-emerald-600"
                                : question.crop_status === "incorrect"
                                  ? "text-red-600"
                                  : "text-amber-600"
                            }
                          >
                            {question.crop_status?.replace("_", " ")}
                          </span>
                        </summary>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <div className="space-y-3">
                            {question.question_images?.length ? (
                              question.question_images
                                .sort((a, b) => a.image_order - b.image_order)
                                .map((image) => (
                                  <figure key={image.id}>
                                    <img
                                      src={image.image_url}
                                      alt={`Question ${question.question_number}, page ${image.page_number}`}
                                      className="w-full rounded-lg border bg-slate-50"
                                    />
                                    <figcaption className="mt-1 text-xs text-slate-400">
                                      Source page {image.page_number}
                                      {image.needs_review
                                        ? " · fallback crop"
                                        : ""}
                                    </figcaption>
                                  </figure>
                                ))
                            ) : (
                              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                                No screenshot generated yet. Reprocess this
                                resource.
                              </p>
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Extracted text
                            </h4>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                              {question.question_text}
                            </p>
                            {question.answer_text && (
                              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                                <b>Marking scheme:</b> {question.answer_text}
                              </p>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  reviewCrop(
                                    resource.id,
                                    question.id,
                                    "correct",
                                  )
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                              >
                                Mark correct
                              </button>
                              <button
                                onClick={() =>
                                  reviewCrop(
                                    resource.id,
                                    question.id,
                                    "incorrect",
                                  )
                                }
                                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                              >
                                Mark incorrect
                              </button>
                              <button
                                disabled={busy === question.id}
                                onClick={() => generateScreenshots(resource.id, question.id)}
                                className="rounded-lg border px-3 py-2 text-xs font-semibold"
                              >
                                Regenerate screenshot
                              </button>
                            </div>
                          </div>
                        </div>
                      </details>
                    ))}
                    {!open.length && (
                      <p className="text-sm text-gray-500">
                        No extracted questions for this resource.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!resources.length && (
            <p className="p-10 text-center text-gray-500">
              No resources uploaded yet.
            </p>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
