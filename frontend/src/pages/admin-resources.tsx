import { API_BASE_URL, requestResourceProcessing } from "@/api/client";
import { AppLayout } from "@/components/layout/app-layout";
import { isAdminEmail } from "@/config/admin";
import { useAuth } from "@/context/auth-context";
import { requireSupabase } from "@/lib/supabase";
import { BookOpen, FileUp, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Redirect } from "wouter";

type Level = "O_LEVEL" | "A_LEVEL";
type ResourceType =
  | "PAST_PAPER"
  | "MARKING_SCHEME"
  | "NOTES"
  | "WORKSHEET"
  | "TEST"
  | "TOPICAL"
  | "SYLLABUS"
  | "OTHER";
type Subject = {
  id: number;
  name: string;
  code: string;
  level: Level;
  board: string;
};
type Resource = {
  id: number;
  subject_id: number;
  level: Level;
  title: string;
  resource_type: ResourceType;
  year: number | null;
  session: string | null;
  paper_code: string | null;
  variant: number | null;
  bucket: string;
  storage_path: string;
  original_filename: string;
  status: string;
  processing_status: string;
  processing_error: string | null;
  related_resource_id: number | null;
  subjects: { name: string; code: string } | null;
  ai_chunks: Array<{ count: number }>;
};

const resourceLabels: Record<ResourceType, string> = {
  PAST_PAPER: "Past paper",
  MARKING_SCHEME: "Marking scheme",
  NOTES: "Notes",
  WORKSHEET: "Worksheet",
  TEST: "Test",
  TOPICAL: "Topical",
  SYLLABUS: "Syllabus",
  OTHER: "Other resource",
};
const resourceTypes = Object.keys(resourceLabels) as ResourceType[];

function normalizeResourceType(value: string): ResourceType {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "PAST_PAPER" || normalized === "PAPER")
    return "PAST_PAPER";
  if (normalized === "MARKING_SCHEME" || normalized === "MARK_SCHEME")
    return "MARKING_SCHEME";
  if (normalized === "NOTE" || normalized === "NOTES") return "NOTES";
  if (normalized === "SYLLABUS") return "SYLLABUS";
  if (normalized === "WORKSHEET" || normalized === "WORKSHEETS")
    return "WORKSHEET";
  if (normalized === "TEST" || normalized === "TESTS") return "TEST";
  if (normalized === "TOPICAL" || normalized === "TOPICALS") return "TOPICAL";
  return "OTHER";
}

export default function AdminResources() {
  const { user, isLoading } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingSubject, setEditingSubject] = useState<number | null>(null);
  const [subjectForm, setSubjectForm] = useState<{
    name: string;
    code: string;
    level: Level;
    board?: string;
  }>({ name: "", code: "", level: "O_LEVEL", board: "CAMBRIDGE" });
  const [file, setFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    subjectId: "",
    title: "",
    type: "PAST_PAPER" as ResourceType,
    year: "",
    session: "MAY_JUNE",
    paperCode: "",
    variant: "",
  });
  const [filters, setFilters] = useState({ subjectId: "", type: "", year: "" });
  const [editingResource, setEditingResource] = useState<number | null>(null);
  const [resourceDraft, setResourceDraft] = useState({
    title: "",
    year: "",
    session: "",
    paperCode: "",
    variant: "",
  });

  async function load() {
    const client = requireSupabase();
    const [subjectResult, resourceResult] = await Promise.all([
      client
        .from("subjects")
        .select("id,name,code,level,board")
        .order("level")
        .order("name"),
      client
        .from("resources")
        .select(
          "id,subject_id,level,title,resource_type,year,session,paper_code,variant,bucket,storage_path,original_filename,status,processing_status,processing_error,related_resource_id,subjects(name,code),ai_chunks(count)",
        )
        .order("created_at", { ascending: false }),
    ]);
    if (subjectResult.error) throw subjectResult.error;
    if (resourceResult.error) throw resourceResult.error;
    setSubjects((subjectResult.data ?? []) as Subject[]);
    setResources((resourceResult.data ?? []) as unknown as Resource[]);
  }
  useEffect(() => {
    void load().catch((error) => setMessage(error.message));
  }, []);

  if (isLoading)
    return (
      <AppLayout>
        <div />
      </AppLayout>
    );
  if (!isAdminEmail(user?.email)) return <Redirect to="/dashboard" />;

  async function saveSubject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const client = requireSupabase();
    const payload = {
      name: subjectForm.name.trim(),
      code: subjectForm.code.trim(),
      level: subjectForm.level,
      board: (subjectForm.board ?? "CAMBRIDGE").trim().toUpperCase(),
      updated_at: new Date().toISOString(),
    };
    const result = editingSubject
      ? await client.from("subjects").update(payload).eq("id", editingSubject)
      : await client
          .from("subjects")
          .insert({ ...payload, color: "#0B1F3A", icon: "book" });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    setEditingSubject(null);
    setSubjectForm({
      name: "",
      code: "",
      level: "O_LEVEL",
      board: "CAMBRIDGE",
    });
    setMessage("Subject saved.");
    await load();
  }

  async function deleteSubject(subject: Subject) {
    if (!window.confirm(`Delete ${subject.name} and all of its resources?`))
      return;
    setBusy(true);
    const client = requireSupabase();
    const owned = resources.filter(
      (resource) => resource.subject_id === subject.id,
    );
    if (owned.length)
      await client.storage
        .from("resources")
        .remove(owned.map((resource) => resource.storage_path));
    const { error } = await client
      .from("subjects")
      .delete()
      .eq("id", subject.id);
    setBusy(false);
    setMessage(error?.message ?? "Subject deleted.");
    if (!error) await load();
  }

  async function uploadResource(event: FormEvent) {
    event.preventDefault();
    if (!file || !uploadForm.subjectId) return;
    setBusy(true);
    setMessage("");
    const client = requireSupabase();
    const subject = subjects.find(
      (item) => item.id === Number(uploadForm.subjectId),
    );
    if (!subject) {
      setBusy(false);
      setMessage("Choose a valid subject.");
      return;
    }
    const resourceType = normalizeResourceType(uploadForm.type);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${subject.level}/${subject.code}/${resourceType}/${uploadForm.year || "general"}/${Date.now()}-${safeName}`;
    try {
      const { error: storageError } = await client.storage
        .from("resources")
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (storageError) throw storageError;
      const { data: resource, error } = await client
        .from("resources")
        .insert({
          subject_id: subject.id,
          level: subject.level,
          board: subject.board,
          title: uploadForm.title.trim(),
          resource_type: resourceType,
          year: uploadForm.year ? Number(uploadForm.year) : null,
          session: uploadForm.session || null,
          paper_code: uploadForm.paperCode.trim() || null,
          variant: uploadForm.variant ? Number(uploadForm.variant) : null,
          bucket: "resources",
          storage_path: path,
          file_path: path,
          file_url: path,
          original_filename: file.name,
          file_type: file.type || null,
          file_size_bytes: file.size,
          status: "uploaded",
          processing_status: "pending",
        })
        .select("id,subject_id,resource_type,title")
        .single();
      if (error || !resource) {
        await client.storage.from("resources").remove([path]);
        throw error ?? new Error("Could not save resource metadata.");
      }
      console.info("[resources] upload saved", {
        id: resource.id,
        subjectId: resource.subject_id,
        resourceType: resource.resource_type,
        title: resource.title,
      });
      await load();
      setFile(null);
      setUploadForm((current) => ({
        ...current,
        title: "",
        paperCode: "",
        variant: "",
      }));
      const { data: session } = await client.auth.getSession();
      const response = await requestResourceProcessing(resource.id, session.session?.access_token ?? "");
      const processing = (response.status === 202 ? {} : await response.json()) as {
        chunks?: number;
        embeddings?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          `File saved, but processing failed: ${processing.error ?? `HTTP ${response.status}`}`,
        );
      setMessage(response.status === 202
        ? `${resourceLabels[resourceType]} uploaded to ${subject.name}. Automatic processing is running in the background.`
        : `${resourceLabels[resourceType]} uploaded to ${subject.name} and processed into ${processing.chunks ?? 0} searchable chunks.`);
      await load();
    } catch (uploadError) {
      console.error("[resources] upload failed", {
        subjectId: subject.id,
        resourceType,
        path,
        error: uploadError,
      });
      setMessage(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Please try again.",
      );
      await load().catch((loadError) =>
        console.error("[resources] refresh after failure failed", loadError),
      );
    } finally {
      setBusy(false);
    }
  }

  async function processResource(id: number) {
    setBusy(true);
    const client = requireSupabase();
    const { data } = await client.auth.getSession();
    const response = await requestResourceProcessing(id, data.session?.access_token ?? "");
    const body = (response.status === 202 ? {} : await response.json()) as { chunks?: number; error?: string };
    setBusy(false);
    setMessage(
      response.status === 202 ? "Processing queued. Track progress in Processing Jobs." : response.ok
        ? `Processed ${body.chunks} chunks.`
        : (body.error ?? "Processing failed."),
    );
    await load();
  }

  async function importLegacy() {
    if (!window.confirm("Import all legacy papers and extracted questions into the new AI system? Existing legacy data will not be deleted.")) return;
    setBusy(true);
    setMessage("Importing legacy papers and questions…");
    try {
      const client = requireSupabase();
      const { data } = await client.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/resources/import-legacy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
      });
      const body = await response.json() as { legacyPapers?: number; importedResources?: number; importedQuestions?: number; importedChunks?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Legacy import failed.");
      setMessage(`Imported ${body.legacyPapers ?? 0} legacy papers, ${body.importedQuestions ?? 0} questions, and ${body.importedChunks ?? 0} searchable chunks. Old records were preserved.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Legacy import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteResource(id: number) {
    if (!window.confirm("Delete this resource and all of its AI chunks?"))
      return;
    setBusy(true);
    const client = requireSupabase();
    const { data } = await client.auth.getSession();
    const response = await fetch(`${API_BASE_URL}/api/resources/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${data.session?.access_token}` },
    });
    setBusy(false);
    setMessage(
      response.ok
        ? "Resource deleted."
        : ((await response.json()).error ?? "Delete failed."),
    );
    if (response.ok) await load();
  }

  async function saveResource(id: number) {
    const { error } = await requireSupabase()
      .from("resources")
      .update({
        title: resourceDraft.title.trim(),
        year: resourceDraft.year ? Number(resourceDraft.year) : null,
        session: resourceDraft.session || null,
        paper_code: resourceDraft.paperCode.trim() || null,
        variant: resourceDraft.variant ? Number(resourceDraft.variant) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setMessage(error?.message ?? "Resource updated.");
    if (!error) {
      setEditingResource(null);
      await load();
    }
  }

  async function openResource(resource: Resource) {
    const { data, error } = await requireSupabase()
      .storage.from(resource.bucket)
      .createSignedUrl(resource.storage_path, 3600);
    if (error || !data) {
      setMessage(error?.message ?? "Could not open resource.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const filtered = resources.filter(
    (resource) =>
      (!filters.subjectId ||
        resource.subject_id === Number(filters.subjectId)) &&
      (!filters.type || resource.resource_type === filters.type) &&
      (!filters.year || resource.year === Number(filters.year)),
  );

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-[#0B1F3A]">
            Subjects & resources
          </h1>
          <p className="mt-1 text-gray-500">
            Manage the complete O Level and A Level content library.
          </p>
        </header>
        {message && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-[#0B1F3A]">
            {message}
          </div>
        )}
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              <h2 className="text-xl font-bold text-[#0B1F3A]">
                Subject management
              </h2>
            </div>
            <form
              onSubmit={saveSubject}
              className="grid gap-3 md:grid-cols-2"
            >
              <input
                required
                className="field-input"
                placeholder="Subject name"
                value={subjectForm.name}
                onChange={(e) =>
                  setSubjectForm({ ...subjectForm, name: e.target.value })
                }
              />
              <input
                required
                className="field-input"
                placeholder="Code"
                value={subjectForm.code}
                onChange={(e) =>
                  setSubjectForm({ ...subjectForm, code: e.target.value })
                }
              />
              <select
                className="field-input"
                value={subjectForm.level}
                onChange={(e) =>
                  setSubjectForm({
                    ...subjectForm,
                    level: e.target.value as Level,
                  })
                }
              >
                <option value="O_LEVEL">O Level</option>
                <option value="A_LEVEL">A Level</option>
              </select>
              <select
                required
                className="field-input"
                value={subjectForm.board ?? "CAMBRIDGE"}
                onChange={(e) =>
                  setSubjectForm({ ...subjectForm, board: e.target.value })
                }
              >
                <option value="CAMBRIDGE">Cambridge</option>
                <option value="EDEXCEL">Edexcel</option>
                <option value="AQA">AQA</option>
                <option value="OCR">OCR</option>
              </select>
              <button
                disabled={busy}
                className="rounded-xl bg-[#0B1F3A] px-4 py-3 text-white md:col-span-2"
              >
                {editingSubject ? "Update" : "Add"}
              </button>
            </form>
            <div className="mt-5 max-h-80 divide-y overflow-y-auto">
              {subjects.map((subject) => (
                <div
                  key={subject.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <b>{subject.name}</b>
                    <p className="text-xs text-gray-500">
                      {subject.code} ·{" "}
                      {subject.level === "O_LEVEL" ? "O Level" : "A Level"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border p-2"
                      onClick={() => {
                        setEditingSubject(subject.id);
                        setSubjectForm({
                          name: subject.name,
                          code: subject.code,
                          level: subject.level,
                          board: subject.board,
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-lg border p-2 text-red-600"
                      onClick={() => deleteSubject(subject)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              <h2 className="text-xl font-bold text-[#0B1F3A]">
                Upload resource
              </h2>
            </div>
            <form
              onSubmit={uploadResource}
              className="grid gap-3 md:grid-cols-2"
            >
              <select
                required
                className="field-input"
                value={uploadForm.subjectId}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, subjectId: e.target.value })
                }
              >
                <option value="">Choose subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              <select
                className="field-input"
                value={uploadForm.type}
                onChange={(e) =>
                  setUploadForm({
                    ...uploadForm,
                    type: e.target.value as ResourceType,
                  })
                }
              >
                {resourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {resourceLabels[type]}
                  </option>
                ))}
              </select>
              <input
                required
                className="field-input md:col-span-2"
                placeholder="Resource title"
                value={uploadForm.title}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, title: e.target.value })
                }
              />
              <input
                type="number"
                className="field-input"
                placeholder="Year"
                value={uploadForm.year}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, year: e.target.value })
                }
              />
              <select
                className="field-input"
                value={uploadForm.session}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, session: e.target.value })
                }
              >
                <option value="">No session</option>
                <option value="MAY_JUNE">May/June</option>
                <option value="OCT_NOV">Oct/Nov</option>
                <option value="FEB_MAR">Feb/March</option>
              </select>
              <input
                className="field-input"
                placeholder="Paper code"
                value={uploadForm.paperCode}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, paperCode: e.target.value })
                }
              />
              <input
                type="number"
                className="field-input"
                placeholder="Variant"
                value={uploadForm.variant}
                onChange={(e) =>
                  setUploadForm({ ...uploadForm, variant: e.target.value })
                }
              />
              <input
                required
                type="file"
                accept="application/pdf,text/plain,.pdf,.txt"
                className="field-input md:col-span-2"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                disabled={busy || !file}
                className="rounded-xl bg-[#14B8A6] px-5 py-3 font-semibold text-white md:col-span-2"
              >
                {busy ? "Working…" : "Upload and process"}
              </button>
            </form>
          </section>
        </div>
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#0B1F3A]">
                Resource manager
              </h2>
              <p className="text-sm text-gray-500">
                {filtered.length} matching resources
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={importLegacy}
                className="mt-3 rounded-lg border border-[#14B8A6] px-3 py-2 text-sm font-semibold text-[#0B1F3A] disabled:opacity-50"
              >
                Import legacy papers into new AI system
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                className="field-input"
                value={filters.subjectId}
                onChange={(e) =>
                  setFilters({ ...filters, subjectId: e.target.value })
                }
              >
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className="field-input"
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value })
                }
              >
                <option value="">All types</option>
                {resourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {resourceLabels[type]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="field-input"
                placeholder="Year"
                value={filters.year}
                onChange={(e) =>
                  setFilters({ ...filters, year: e.target.value })
                }
              />
            </div>
          </div>
          <div className="divide-y">
            {filtered.map((resource) => (
              <div key={resource.id} className="p-5">
                {editingResource === resource.id ? (
                  <div className="grid gap-2 md:grid-cols-7">
                    <input
                      className="field-input md:col-span-2"
                      value={resourceDraft.title}
                      onChange={(e) =>
                        setResourceDraft({
                          ...resourceDraft,
                          title: e.target.value,
                        })
                      }
                    />
                    <input
                      className="field-input"
                      placeholder="Year"
                      value={resourceDraft.year}
                      onChange={(e) =>
                        setResourceDraft({
                          ...resourceDraft,
                          year: e.target.value,
                        })
                      }
                    />
                    <input
                      className="field-input"
                      placeholder="Session"
                      value={resourceDraft.session}
                      onChange={(e) =>
                        setResourceDraft({
                          ...resourceDraft,
                          session: e.target.value,
                        })
                      }
                    />
                    <input
                      className="field-input"
                      placeholder="Paper code"
                      value={resourceDraft.paperCode}
                      onChange={(e) =>
                        setResourceDraft({
                          ...resourceDraft,
                          paperCode: e.target.value,
                        })
                      }
                    />
                    <input
                      className="field-input"
                      placeholder="Variant"
                      value={resourceDraft.variant}
                      onChange={(e) =>
                        setResourceDraft({
                          ...resourceDraft,
                          variant: e.target.value,
                        })
                      }
                    />
                    <button
                      className="rounded-lg bg-[#0B1F3A] text-white"
                      onClick={() => saveResource(resource.id)}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-[#0B1F3A]">{resource.title}</b>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                          {resourceLabels[resource.resource_type]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {resource.subjects?.name} · {resource.year ?? "General"}{" "}
                        · {resource.paper_code ?? "No paper code"} ·{" "}
                        {resource.ai_chunks?.[0]?.count ?? 0} chunks
                      </p>
                      {resource.processing_error && (
                        <p className="mt-1 text-xs text-red-600">
                          {resource.processing_error}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-lg border px-3 py-2 text-sm"
                        onClick={() => openResource(resource)}
                      >
                        Open
                      </button>
                      <button
                        className="rounded-lg border p-2"
                        onClick={() => processResource(resource.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-lg border p-2"
                        onClick={() => {
                          setEditingResource(resource.id);
                          setResourceDraft({
                            title: resource.title,
                            year: String(resource.year ?? ""),
                            session: resource.session ?? "",
                            paperCode: resource.paper_code ?? "",
                            variant: String(resource.variant ?? ""),
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-lg border p-2 text-red-600"
                        onClick={() => deleteResource(resource.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!filtered.length && (
              <p className="p-10 text-center text-gray-500">
                No resources match these filters.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
