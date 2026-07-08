import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase, supabase } from "@/lib/supabase";
import type {
  ActivityItem,
  AiAssistantRequest,
  AiAssistantResponse,
  AiMessage,
  Dashboard,
  DirectPdfUploadInput,
  DirectPdfUploadResult,
  Exam,
  ListNotesParams,
  ListPapersParams,
  ListQuestionsParams,
  ListSubjectsParams,
  Note,
  OnboardInput,
  Paper,
  Question,
  Subject,
  SubjectProgress,
  UserProfile,
} from "./types";

const LEGACY_DEMO_KEY = "parhai.demo.user";
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") ?? "";
export const API_BASE_URL = import.meta.env.PROD && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configuredApiUrl)
  ? ""
  : configuredApiUrl;

export function requestResourceProcessing(resourceId: number, accessToken: string) {
  const useNetlifyBackground = import.meta.env.PROD && !configuredApiUrl;
  return fetch(useNetlifyBackground ? "/.netlify/functions/process-resource-background" : `${API_BASE_URL}/api/resources/${resourceId}/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: useNetlifyBackground ? JSON.stringify({ resourceId }) : undefined,
  });
}

export type ResourceDeletionPreview = {
  id: number;
  title: string;
  originalFilename: string;
  storagePath: string;
  subjectId: number;
  subjectName: string;
  year: number | null;
  resourceType: "PAST_PAPER" | "MARKING_SCHEME" | "GRADE_THRESHOLD" | "EXAMINER_REPORT" | "INSERT" | "SOURCE_FILE" | "NOTES" | "WORKSHEET" | "TEST" | "TOPICAL" | "SYLLABUS" | "OTHER";
  indexedQuestions: number;
  searchableChunks: number;
  processingJobs: number;
};

async function resourceAdminToken() {
  const { data } = await requireSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again before managing resources.");
  return token;
}

export async function getResourceDeletionPreview(resourceId: number) {
  const response = await fetch(`${API_BASE_URL}/api/resources/${resourceId}/delete-preview`, {
    headers: { Authorization: `Bearer ${await resourceAdminToken()}` },
    cache: "no-store",
  });
  const body = await response.json() as ResourceDeletionPreview & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Could not load deletion details.");
  return body;
}

export async function deleteResource(resourceId: number) {
  const response = await fetch(`${API_BASE_URL}/api/resources/${resourceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${await resourceAdminToken()}` },
  });
  const body = await response.json() as {
    indexedQuestionsDeleted?: number;
    chunksDeleted?: number;
    processingJobsDeleted?: number;
    legacyQuestionsDeleted?: number;
    audit?: Record<string, boolean | number>;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Permanent resource deletion failed.");
  return body;
}

type Level = "O_LEVEL" | "A_LEVEL";
type PaperSession = "MAY_JUNE" | "OCT_NOV" | "FEB_MAR";
type PaperType = "PAST_PAPER" | "MARKING_SCHEME";
type Difficulty = "EASY" | "MEDIUM" | "HARD";

type SubjectRow = {
  id: number;
  name: string;
  code: string;
  level: Level;
  board: string;
  description: string | null;
  color: string | null;
  icon: string | null;
};

type PastPaperRow = {
  id: number;
  level: Level;
  subject_id: number;
  title: string;
  year: number;
  session: PaperSession;
  paper_number: number;
  variant: number | null;
  type: PaperType;
  file_url: string | null;
  storage_path: string | null;
  created_at: string;
  subjects?: Pick<SubjectRow, "name" | "code"> | null;
  marking_schemes?: Array<{ storage_path: string }> | null;
  source_type?: "QUESTION_PAPER" | "MARK_SCHEME" | "EXAMINER_REPORT" | null;
  original_filename?: string | null;
  file_type?: string | null;
};

type NoteRow = {
  id: number;
  subject_id: number;
  title: string;
  topic: string;
  content: string | null;
  summary: string | null;
  reading_time: number | null;
  created_at: string;
  subjects?: Pick<SubjectRow, "name"> | null;
};

type QuestionRow = {
  id: number;
  subject_id: number;
  topic: string;
  difficulty: Difficulty;
  question: string;
  answer: string | null;
  marking_points: string[] | null;
  marks: number;
  year: number | null;
  subjects?: Pick<SubjectRow, "name"> | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  level: Level | null;
  onboarded: boolean | null;
  streak_days: number | null;
  created_at: string;
};

type AiHistoryRow = {
  id: number;
  subject_id: number | null;
  role: "user" | "assistant";
  content: string;
  sources: AiAssistantResponse["sources"] | null;
  created_at: string;
};

export const USER_PROFILE_KEY = ["supabase", "user-profile"] as const;

export const getGetUserProfileQueryKey = () => USER_PROFILE_KEY;
export const getGetDashboardQueryKey = () => ["supabase", "dashboard"] as const;
export const getListSubjectsQueryKey = (params?: ListSubjectsParams) => ["supabase", "subjects", params] as const;
export const getGetSubjectQueryKey = (id: number) => ["supabase", "subjects", id] as const;
export const getListPapersQueryKey = (params?: ListPapersParams) => ["supabase", "papers", params] as const;
export const getListNotesQueryKey = (params?: ListNotesParams) => ["supabase", "notes", params] as const;
export const getListQuestionsQueryKey = (params?: ListQuestionsParams) => ["supabase", "questions", params] as const;

export function clearStoredUser() {
  window.localStorage.removeItem(LEGACY_DEMO_KEY);
}

export async function signInWithPassword(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/login`,
      data: {
        name: email.split("@")[0],
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  clearStoredUser();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
}

async function getCurrentUserId() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

/** Canonical study-event types logged to the `study_events` table for analytics. */
export const STUDY_EVENT = {
  AI_QUESTION: "ai_question",
  QUESTION_PRACTICED: "question_practiced",
  QUESTION_SAVED: "question_saved",
  PAPER_VIEWED: "paper_viewed",
  NOTE_VIEWED: "note_viewed",
} as const;
export type StudyEventType = (typeof STUDY_EVENT)[keyof typeof STUDY_EVENT];

type StudyEventRow = {
  id: number;
  subject_id: number | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

/**
 * Record a learning action for dashboard analytics. Best-effort by design: an
 * analytics write must never break or block the student's primary action, so
 * failures (offline, RLS, misconfiguration) are swallowed silently.
 */
export async function logStudyEvent(
  eventType: StudyEventType,
  subjectId?: number | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const client = requireSupabase();
    const userId = await getCurrentUserId();
    await client.from("study_events").insert({
      user_id: userId,
      subject_id: subjectId ?? null,
      event_type: eventType,
      metadata,
    });
  } catch {
    // Intentionally ignored — analytics failures should be invisible to the student.
  }
}

function mapSubject(row: SubjectRow, counts?: { papers?: number; notes?: number; questions?: number }): Subject {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    level: row.level,
    board: row.board,
    description: row.description ?? "",
    color: row.color ?? "#0B1F3A",
    icon: row.icon ?? "book",
    totalPapers: counts?.papers ?? 0,
    totalNotes: counts?.notes ?? 0,
    totalQuestions: counts?.questions ?? 0,
  };
}

function mapPastPaper(row: PastPaperRow): Paper {
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectName: row.subjects?.name ?? "Physics",
    subjectCode: row.subjects?.code,
    level: row.level,
    title: row.title,
    year: row.year,
    session: row.session,
    paperNumber: row.paper_number,
    type: row.source_type === "EXAMINER_REPORT" ? "EXAMINER_REPORT" : row.type,
    variant: row.variant,
    fileUrl: row.storage_path ?? row.file_url,
    markingSchemeUrl: row.marking_schemes?.[0]?.storage_path ?? null,
    topicTags: [],
    originalFilename: row.original_filename,
    fileType: row.file_type,
  };
}

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectName: row.subjects?.name ?? "Subject",
    title: row.title,
    topic: row.topic,
    content: row.content ?? "",
    summary: row.summary ?? "",
    readingTime: row.reading_time ?? 0,
    createdAt: row.created_at,
  };
}

function mapQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectName: row.subjects?.name ?? "Subject",
    topic: row.topic,
    difficulty: row.difficulty,
    question: row.question,
    answer: row.answer ?? "",
    markingPoints: row.marking_points ?? [],
    marks: row.marks,
    year: row.year,
  };
}

async function countBySubject(table: string, subjectIds: number[], resourceType?: "PAST_PAPER" | "NOTES") {
  const client = requireSupabase();
  const counts = new Map<number, number>();
  await Promise.all(
    subjectIds.map(async (subjectId) => {
      let query = client
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("subject_id", subjectId);
      if (table === "papers") query = query.in("ingestion_status", ["ready", "ready_without_embeddings", "ready_without_processing"]);
      if (table === "resources" && resourceType) query = query.eq("resource_type", resourceType);
      const { count, error } = await query;
      if (error) throw error;
      counts.set(subjectId, count ?? 0);
    })
  );
  return counts;
}

async function listSubjects(params?: ListSubjectsParams): Promise<Subject[]> {
  if (!isSupabaseConfigured) return [];
  const client = requireSupabase();
  let query = client.from("subjects").select("id,name,code,level,board,description,color,icon").order("name");
  if (params?.level) query = query.eq("level", params.level);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as SubjectRow[];
  const ids = rows.map((row) => row.id);
  const [paperCounts, noteCounts, questionCounts] = await Promise.all([
    countBySubject("resources", ids, "PAST_PAPER"),
    countBySubject("resources", ids, "NOTES"),
    countBySubject("questions", ids),
  ]);

  return rows.map((row) =>
    mapSubject(row, {
      papers: paperCounts.get(row.id) ?? 0,
      notes: noteCounts.get(row.id) ?? 0,
      questions: questionCounts.get(row.id) ?? 0,
    })
  );
}

async function getSubject(id: number): Promise<Subject> {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured");
  const subjects = await listSubjects();
  const subject = subjects.find((item) => item.id === id);
  if (!subject) throw new Error("Subject not found");
  return subject;
}

async function listPapers(params?: ListPapersParams): Promise<Paper[]> {
  if (!isSupabaseConfigured) return [];
  const client = requireSupabase();
  let query = client
    .from("papers")
    .select("id,level,subject_id,title,year,session,paper_number,variant,type,source_type,file_url,storage_path,original_filename,file_type,created_at,subjects(name,code),marking_schemes(storage_path)")
    .in("ingestion_status", ["ready", "ready_without_embeddings", "ready_without_processing"])
    .order("year", { ascending: false });
  if (params?.subjectId) query = query.eq("subject_id", params.subjectId);
  if (params?.type === "EXAMINER_REPORT") query = query.eq("source_type", "EXAMINER_REPORT");
  else if (params?.type) query = query.eq("type", params.type);
  if (params?.year) query = query.eq("year", params.year);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as PastPaperRow[]).map(mapPastPaper);
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function uploadPdfDirect(input: DirectPdfUploadInput): Promise<DirectPdfUploadResult> {
  const client = requireSupabase();
  const bucket = input.resourceType === "PAPER" ? "papers" : input.resourceType === "MARKING_SCHEME" ? "marking-schemes" : input.resourceType === "EXAMINER_REPORT" ? "examiner-reports" : "notes";
  const path = [
    input.level,
    input.subjectCode,
    input.resourceType === "NOTE" ? "notes" : String(input.year),
    input.resourceType === "NOTE" ? Date.now() : input.session,
    `${Date.now()}-${safeFileName(input.file.name)}`,
  ].join("/");

  const { error: uploadError } = await client.storage.from(bucket).upload(path, input.file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  let resourceId: number | null = null;
  try {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) throw new Error("Please sign in again before uploading.");

    const canonicalType = input.resourceType === "PAPER"
      ? "PAST_PAPER"
      : input.resourceType === "MARKING_SCHEME"
        ? "MARKING_SCHEME"
        : input.resourceType === "NOTE"
          ? "NOTES"
          : "OTHER";
    const { data: resource, error: resourceError } = await client.from("resources").insert({
      subject_id: input.subjectId,
      level: input.level,
      resource_type: canonicalType,
      title: input.title,
      year: input.resourceType === "NOTE" ? null : input.year,
      session: input.resourceType === "NOTE" ? null : input.session,
      paper_code: input.resourceType === "NOTE" ? null : String(input.paperNumber),
      variant: input.resourceType === "NOTE" ? null : input.variant,
      bucket,
      storage_path: path,
      file_path: path,
      file_url: path,
      original_filename: input.file.name,
      file_type: input.file.type || "application/pdf",
      file_size_bytes: input.file.size,
      status: "uploaded",
      processing_status: "pending",
    }).select("id").single();
    if (resourceError || !resource) throw resourceError ?? new Error("Could not save resource metadata.");
    resourceId = Number(resource.id);

    if (input.resourceType === "PAPER" || input.resourceType === "EXAMINER_REPORT") {
      const { data, error } = await client.from("papers").insert({
        subject_id: input.subjectId,
        title: input.title,
        year: input.year,
        session: input.session,
        paper_number: input.paperNumber,
        type: "PAST_PAPER",
        variant: input.variant,
        file_url: path,
        level: input.level,
        subject_code: input.subjectCode,
        storage_path: path,
        ingestion_status: "ready_without_processing",
        source_type: input.resourceType === "EXAMINER_REPORT" ? "EXAMINER_REPORT" : "QUESTION_PAPER",
        original_filename: input.file.name,
        file_type: input.file.type || "application/pdf",
        file_size_bytes: input.file.size,
      }).select("id").single();
      if (error || !data) throw error ?? new Error("Could not save paper metadata.");
      await client.from("uploads").insert({ user_id: authData.user.id, subject_id: input.subjectId, paper_id: data.id, source_type: input.resourceType === "EXAMINER_REPORT" ? "EXAMINER_REPORT" : "QUESTION_PAPER", bucket, storage_path: path, original_filename: input.file.name, file_type: input.file.type || "application/pdf", file_size_bytes: input.file.size, status: "uploaded" });
      void client.auth.getSession().then(({ data: sessionData }) => requestResourceProcessing(resourceId!, sessionData.session?.access_token ?? "")).catch(() => undefined);
      return { bucket, path, metadataId: Number(data.id) };
    }

    if (input.resourceType === "MARKING_SCHEME") {
      if (!input.relatedPaperId) throw new Error("Choose the question paper this marking scheme belongs to.");
      const { data, error } = await client.from("marking_schemes").upsert({
        paper_id: input.relatedPaperId,
        storage_path: path,
        ingestion_status: "ready_without_processing",
        original_filename: input.file.name,
        file_type: input.file.type || "application/pdf",
        file_size_bytes: input.file.size,
      }, { onConflict: "paper_id" }).select("id").single();
      if (error || !data) throw error ?? new Error("Could not save marking-scheme metadata.");
      await client.from("uploads").insert({ user_id: authData.user.id, subject_id: input.subjectId, paper_id: input.relatedPaperId, source_type: "MARK_SCHEME", bucket, storage_path: path, original_filename: input.file.name, file_type: input.file.type || "application/pdf", file_size_bytes: input.file.size, status: "uploaded" });
      void client.auth.getSession().then(({ data: sessionData }) => requestResourceProcessing(resourceId!, sessionData.session?.access_token ?? "")).catch(() => undefined);
      return { bucket, path, metadataId: Number(data.id) };
    }

    const { data, error } = await client.from("notes").insert({
      subject_id: input.subjectId,
      title: input.title,
      topic: input.topic?.trim() || "General",
      content: null,
      summary: "PDF uploaded; optional processing has not run yet.",
      reading_time: 0,
      storage_path: path,
      ingestion_status: "ready_without_processing",
    }).select("id").single();
    if (error || !data) throw error ?? new Error("Could not save note metadata.");
    await client.from("uploads").insert({ user_id: authData.user.id, subject_id: input.subjectId, source_type: "NOTE", bucket, storage_path: path, original_filename: input.file.name, file_type: input.file.type || "application/pdf", file_size_bytes: input.file.size, status: "uploaded" });
    void client.auth.getSession().then(({ data: sessionData }) => requestResourceProcessing(resourceId!, sessionData.session?.access_token ?? "")).catch(() => undefined);
    return { bucket, path, metadataId: Number(data.id) };
  } catch (error) {
    if (resourceId !== null) await client.from("resources").delete().eq("id", resourceId);
    await client.storage.from(bucket).remove([path]);
    throw error;
  }
}

async function listNotes(params?: ListNotesParams): Promise<Note[]> {
  if (!isSupabaseConfigured) return [];
  const client = requireSupabase();
  let query = client
    .from("notes")
    .select("id,subject_id,title,topic,content,summary,reading_time,created_at,subjects(name)")
    .order("created_at", { ascending: false });
  if (params?.subjectId) query = query.eq("subject_id", params.subjectId);
  if (params?.topic) query = query.eq("topic", params.topic);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as NoteRow[]).map(mapNote);
}

async function listQuestions(params?: ListQuestionsParams): Promise<Question[]> {
  if (!isSupabaseConfigured) return [];
  const client = requireSupabase();
  let query = client
    .from("questions")
    .select("id,subject_id,topic,difficulty,question,answer,marking_points,marks,year,subjects(name)")
    .order("id");
  if (params?.subjectId) query = query.eq("subject_id", params.subjectId);
  if (params?.difficulty) query = query.eq("difficulty", params.difficulty);
  if (params?.topic) query = query.eq("topic", params.topic);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as QuestionRow[]).map(mapQuestion);
}

async function getSelectedSubjectIds(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client.from("user_subjects").select("subject_id").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => Number(row.subject_id));
}

async function getUserProfile(): Promise<UserProfile> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const authUser = userData.user;
  if (!authUser) throw new Error("Not signed in");

  const { data, error } = await client.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
  if (error) throw error;

  const metadata = authUser.user_metadata ?? {};
  const profile = data as ProfileRow | null;

  if (!profile) {
    const inserted: Omit<ProfileRow, "created_at"> = {
      id: authUser.id,
      name: metadata.full_name ?? metadata.name ?? authUser.email ?? "Student",
      email: authUser.email ?? null,
      avatar_url: metadata.avatar_url ?? null,
      level: null,
      onboarded: false,
      streak_days: 0,
    };
    const { data: created, error: createError } = await client.from("profiles").insert(inserted).select("*").single();
    if (createError) throw createError;
    const createdProfile = created as ProfileRow;
    return {
      id: createdProfile.id,
      googleId: null,
      name: createdProfile.name ?? "Student",
      email: createdProfile.email ?? authUser.email ?? "",
      avatarUrl: createdProfile.avatar_url,
      level: createdProfile.level,
      subjectIds: [],
      onboarded: Boolean(createdProfile.onboarded),
      streakDays: createdProfile.streak_days ?? 0,
      createdAt: createdProfile.created_at,
    };
  }

  return {
    id: profile.id,
    googleId: null,
    name: profile.name ?? authUser.email ?? "Student",
    email: profile.email ?? authUser.email ?? "",
    avatarUrl: profile.avatar_url,
    level: profile.level,
    subjectIds: await getSelectedSubjectIds(authUser.id),
    onboarded: Boolean(profile.onboarded),
    streakDays: profile.streak_days ?? 0,
    createdAt: profile.created_at,
  };
}

// Dashboard analytics are derived from the append-only `study_events` log.
const STUDY_SESSION_GAP_MS = 30 * 60 * 1000; // events >30min apart begin a new study session
const MIN_SESSION_MINUTES = 2; // floor so a single quick action still counts as a little study time
const PRACTICE_EVENT_TYPES = new Set<string>([STUDY_EVENT.AI_QUESTION, STUDY_EVENT.QUESTION_PRACTICED]);

async function getStudyEvents(): Promise<StudyEventRow[]> {
  if (!isSupabaseConfigured) return [];
  const client = requireSupabase();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("study_events")
    .select("id,subject_id,event_type,metadata,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as StudyEventRow[];
}

/**
 * Estimate active study minutes from event timestamps using gap-based
 * sessionization: consecutive events within STUDY_SESSION_GAP_MS belong to one
 * session, and each session contributes at least MIN_SESSION_MINUTES. This is a
 * real, conservative estimate of time-on-platform rather than a fabricated figure.
 */
function estimateSessionMinutes(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  let total = 0;
  let sessionStart = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - prev > STUDY_SESSION_GAP_MS) {
      total += Math.max((prev - sessionStart) / 60_000, MIN_SESSION_MINUTES);
      sessionStart = sorted[i];
    }
    prev = sorted[i];
  }
  total += Math.max((prev - sessionStart) / 60_000, MIN_SESSION_MINUTES);
  return total;
}

/** Count consecutive days (ending today or yesterday) that have at least one event. */
function computeStreakDays(isoDates: string[]): number {
  if (isoDates.length === 0) return 0;
  const days = new Set(isoDates.map((value) => value.slice(0, 10)));
  const cursor = new Date();
  const key = () => cursor.toISOString().slice(0, 10);
  if (!days.has(key())) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(key())) return 0; // no activity today or yesterday — streak is broken
  }
  let streak = 0;
  while (days.has(key())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function truncateText(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function describeStudyEvent(event: StudyEventRow): string {
  switch (event.event_type) {
    case STUDY_EVENT.AI_QUESTION: {
      const question = typeof event.metadata?.question === "string" ? event.metadata.question : "";
      return question ? `Asked the AI tutor: “${truncateText(question, 80)}”` : "Asked the AI tutor a question";
    }
    case STUDY_EVENT.QUESTION_PRACTICED:
      return "Practised a past-paper question";
    case STUDY_EVENT.QUESTION_SAVED:
      return "Saved a question for later";
    case STUDY_EVENT.PAPER_VIEWED:
      return "Opened a past paper";
    case STUDY_EVENT.NOTE_VIEWED:
      return "Reviewed revision notes";
    default:
      return "Study activity";
  }
}

async function getDashboard(): Promise<Dashboard> {
  const user = await getUserProfile();
  const allSubjects = await listSubjects();
  const selectedSubjects = allSubjects.filter((subject) => user.subjectIds.includes(subject.id));
  const subjectById = new Map(selectedSubjects.map((subject) => [subject.id, subject]));

  const events = await getStudyEvents();

  const perSubjectTimestamps = new Map<number, number[]>();
  const perSubjectPractice = new Map<number, number>();
  const perSubjectCorrect = new Map<number, number>();
  const perSubjectNotes = new Map<number, Set<string>>();
  const perSubjectLastStudied = new Map<number, string>();
  const allTimestamps: number[] = [];
  let totalAttempted = 0;
  let totalCorrect = 0;

  // Events arrive newest-first, so the first one seen per subject is the latest.
  for (const event of events) {
    const timestamp = new Date(event.created_at).getTime();
    allTimestamps.push(timestamp);
    const subjectId = event.subject_id;
    if (subjectId != null) {
      const list = perSubjectTimestamps.get(subjectId) ?? [];
      list.push(timestamp);
      perSubjectTimestamps.set(subjectId, list);
      if (!perSubjectLastStudied.has(subjectId)) perSubjectLastStudied.set(subjectId, event.created_at);
    }
    if (PRACTICE_EVENT_TYPES.has(event.event_type)) {
      totalAttempted += 1;
      if (subjectId != null) perSubjectPractice.set(subjectId, (perSubjectPractice.get(subjectId) ?? 0) + 1);
      if (event.metadata?.correct === true) {
        totalCorrect += 1;
        if (subjectId != null) perSubjectCorrect.set(subjectId, (perSubjectCorrect.get(subjectId) ?? 0) + 1);
      }
    }
    if (event.event_type === STUDY_EVENT.NOTE_VIEWED && subjectId != null) {
      const noteKey = String(event.metadata?.noteId ?? event.id);
      const set = perSubjectNotes.get(subjectId) ?? new Set<string>();
      set.add(noteKey);
      perSubjectNotes.set(subjectId, set);
    }
  }

  const subjectProgress: SubjectProgress[] = selectedSubjects.map((subject) => {
    const attempted = perSubjectPractice.get(subject.id) ?? 0;
    const hoursStudied = Math.round((estimateSessionMinutes(perSubjectTimestamps.get(subject.id) ?? []) / 60) * 10) / 10;
    // Progress = share of the subject's question bank the student has engaged with.
    const percentComplete = subject.totalQuestions > 0
      ? Math.min(100, Math.round((attempted / subject.totalQuestions) * 100))
      : 0;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      subjectColor: subject.color,
      questionsAttempted: attempted,
      questionsCorrect: perSubjectCorrect.get(subject.id) ?? 0,
      papersCompleted: 0,
      notesRead: perSubjectNotes.get(subject.id)?.size ?? 0,
      hoursStudied,
      percentComplete,
      lastStudied: perSubjectLastStudied.get(subject.id) ?? null,
    };
  });

  const recentActivity: ActivityItem[] = events.slice(0, 15).map((event) => {
    const subject = event.subject_id != null ? subjectById.get(event.subject_id) : undefined;
    return {
      id: event.id,
      type: event.event_type,
      subjectId: event.subject_id ?? 0,
      subjectName: subject?.name ?? "General",
      subjectColor: subject?.color ?? "#0B1F3A",
      description: describeStudyEvent(event),
      createdAt: event.created_at,
    };
  });

  const streakDays = computeStreakDays(events.map((event) => event.created_at));

  return {
    user,
    streakDays: streakDays || user.streakDays,
    totalHoursStudied: Math.round((estimateSessionMinutes(allTimestamps) / 60) * 10) / 10,
    subjectsEnrolled: selectedSubjects.length,
    questionsAttempted: totalAttempted,
    overallScore: totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0,
    subjectProgress,
    recentActivity,
    upcomingExams: [] as Exam[],
  };
}

async function onboardUser(data: OnboardInput): Promise<UserProfile> {
  const client = requireSupabase();
  const userId = await getCurrentUserId();

  const { error: profileError } = await client.from("profiles").update({ level: data.level, onboarded: true }).eq("id", userId);
  if (profileError) throw profileError;

  const { error: deleteError } = await client.from("user_subjects").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;

  if (data.subjectIds.length > 0) {
    const { error: insertError } = await client.from("user_subjects").insert(
      data.subjectIds.map((subjectId) => ({ user_id: userId, subject_id: subjectId }))
    );
    if (insertError) throw insertError;
  }

  return getUserProfile();
}

async function sendAiAssistantMessage(request: AiAssistantRequest): Promise<AiMessage> {
  const client = requireSupabase();
  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Please sign in again before using the assistant.");

  const response = await fetch(`${API_BASE_URL}/api/ai-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      level: request.level,
      subjectId: request.subjectId,
      subjectName: request.subjectName,
      board: request.board,
      selectedPaperId: request.selectedPaperId ?? null,
      year: request.year ?? null,
      answerLength: request.answerLength ?? "teacher",
      message: request.message,
      chatHistory: request.chatHistory.slice(-20).map(({ role, content }) => ({ role, content })),
    }),
  });
  const data = (await response.json()) as Partial<AiAssistantResponse> & { error?: string };
  if (!response.ok || !data.answer) throw new Error(data.error ?? "AI assistant request failed.");
  return {
    id: `assistant-${Date.now()}`,
    subjectId: request.subjectId,
    role: "assistant",
    content: data.answer,
    sources: data.sources ?? [],
    createdAt: new Date().toISOString(),
  };
}

export function useGetUserProfile(opts?: { query?: { enabled?: boolean; retry?: boolean | number } }) {
  return useQuery<UserProfile>({
    queryKey: USER_PROFILE_KEY,
    queryFn: getUserProfile,
    enabled: opts?.query?.enabled ?? true,
    retry: opts?.query?.retry ?? false,
  });
}

export function useGetDashboard(opts?: { query?: { queryKey?: readonly unknown[] } }) {
  return useQuery<Dashboard>({
    queryKey: opts?.query?.queryKey ?? getGetDashboardQueryKey(),
    queryFn: getDashboard,
  });
}

export function useListSubjects(params?: ListSubjectsParams, opts?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useQuery<Subject[]>({
    queryKey: opts?.query?.queryKey ?? getListSubjectsQueryKey(params),
    queryFn: () => listSubjects(params),
    enabled: opts?.query?.enabled ?? true,
  });
}

export function useGetSubject(id: number, opts?: { query?: { enabled?: boolean; queryKey?: readonly unknown[] } }) {
  return useQuery<Subject>({
    queryKey: opts?.query?.queryKey ?? getGetSubjectQueryKey(id),
    queryFn: () => getSubject(id),
    enabled: opts?.query?.enabled ?? !!id,
  });
}

export function useListPapers(params?: ListPapersParams, opts?: { query?: { queryKey?: readonly unknown[] } }) {
  return useQuery<Paper[]>({
    queryKey: opts?.query?.queryKey ?? getListPapersQueryKey(params),
    queryFn: () => listPapers(params),
  });
}

export function useDirectPdfUpload() {
  const queryClient = useQueryClient();
  return useMutation<DirectPdfUploadResult, Error, DirectPdfUploadInput>({
    mutationFn: uploadPdfDirect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supabase", "papers"] });
      queryClient.invalidateQueries({ queryKey: ["supabase", "subjects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/papers"] });
      queryClient.invalidateQueries({ queryKey: ["supabase", "ai-messages"] });
    },
  });
}

export function useListNotes(params?: ListNotesParams, opts?: { query?: { queryKey?: readonly unknown[] } }) {
  return useQuery<Note[]>({
    queryKey: opts?.query?.queryKey ?? getListNotesQueryKey(params),
    queryFn: () => listNotes(params),
  });
}

export function useListQuestions(params?: ListQuestionsParams, opts?: { query?: { queryKey?: readonly unknown[] } }) {
  return useQuery<Question[]>({
    queryKey: opts?.query?.queryKey ?? getListQuestionsQueryKey(params),
    queryFn: () => listQuestions(params),
  });
}

export function useOnboardUser() {
  const queryClient = useQueryClient();
  return useMutation<UserProfile, Error, { data: OnboardInput }>({
    mutationFn: ({ data }) => onboardUser(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(USER_PROFILE_KEY, updated);
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["supabase", "subjects"] });
    },
  });
}

export function useSendAiMessage() {
  const queryClient = useQueryClient();
  return useMutation<AiMessage, Error, AiAssistantRequest>({
    mutationFn: sendAiAssistantMessage,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["supabase", "ai-messages", variables.subjectId] });
      // Record the interaction for dashboard analytics, then refresh the dashboard
      // so recent activity and study time reflect it immediately.
      void logStudyEvent(STUDY_EVENT.AI_QUESTION, variables.subjectId, { question: variables.message }).then(() => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      });
    },
  });
}

export function useGetAiHistory(subjectId: number) {
  return useQuery<AiMessage[]>({
    queryKey: ["supabase", "ai-messages", subjectId],
    queryFn: async () => {
      const client = requireSupabase();
      const userId = await getCurrentUserId();
      const { data, error } = await client
        .from("chat_messages")
        .select("id,subject_id,role,content,sources,created_at")
        .eq("user_id", userId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as AiHistoryRow[]).map((row) => ({
        id: row.id,
        subjectId: row.subject_id ?? subjectId,
        role: row.role,
        content: row.content,
        sources: row.sources ?? [],
        createdAt: row.created_at,
      }));
    },
    enabled: !!subjectId,
  });
}

export function useClearAiHistory() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { userId: string; subjectId: number }>({
    mutationFn: async ({ userId, subjectId }) => {
      const client = requireSupabase();
      const { error } = await client
        .from("chat_messages")
        .delete()
        .eq("user_id", userId)
        .eq("subject_id", subjectId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["supabase", "ai-messages", variables.subjectId] });
    },
  });
}
