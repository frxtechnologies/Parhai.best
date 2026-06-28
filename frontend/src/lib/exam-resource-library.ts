export type ExamLibraryResource = {
  id: number; title: string; original_filename: string; resource_type: string; subject_id: number;
  year: number | null; session: string | null; paper_code: string | null; paper_number?: number | null;
  variant: number | null; status: string; processing_status: string; import_warning?: string | null;
  subjects: { name: string; code: string } | null;
};

const SESSION_LABELS: Record<string, string> = { OCT_NOV: "Oct/Nov", MAY_JUNE: "May/June", FEB_MAR: "Feb/March", FEB_MARCH: "Feb/March" };
const SESSION_ORDER: Record<string, number> = { OCT_NOV: 0, MAY_JUNE: 1, FEB_MAR: 2, FEB_MARCH: 2 };

export function friendlyResourceName(resource: Pick<ExamLibraryResource, "resource_type" | "paper_code" | "paper_number" | "variant">, subjectName?: string | null) {
  const paper = resource.paper_number ?? (resource.paper_code && /^\d+$/.test(resource.paper_code) ? Number(resource.paper_code) : null);
  const subject = subjectName?.trim() || "Exam";
  const kind = resource.resource_type === "MARKING_SCHEME" ? "Mark Scheme" : resource.resource_type === "PAST_PAPER" ? "Question Paper" : titleCase(resource.resource_type);
  return paper ? `${subject} · Paper ${paper}${resource.variant ? ` · Variant ${resource.variant}` : ""} · ${kind}` : `${subject} · ${kind}`;
}

export function friendlySession(session?: string | null) {
  return session ? SESSION_LABELS[session] ?? titleCase(session) : "General";
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeExamResource(resource: ExamLibraryResource) {
  const paperNumber = resource.paper_number ?? (resource.paper_code && /^\d+$/.test(resource.paper_code) ? Number(resource.paper_code) : null);
  const session = resource.session ?? "NO_SESSION";
  const statusLabel = resource.import_warning ? "Needs Review"
    : resource.processing_status === "processed" ? "Processed"
      : resource.processing_status === "processing" || resource.processing_status === "pending" ? "Processing"
        : resource.processing_status === "failed" ? "Failed" : "Needs Review";
  return {
    displayTitle: paperNumber ? `Paper ${paperNumber} · Variant ${resource.variant ?? "—"}` : resource.resource_type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    year: resource.year,
    session,
    sessionLabel: SESSION_LABELS[session] ?? "General",
    paperNumber,
    paperLabel: paperNumber ? `Paper ${paperNumber}` : "General",
    variantLabel: resource.variant ? `Variant ${resource.variant}` : "No variant",
    examKey: `${resource.subject_id}:${resource.year ?? 0}:${session}:${paperNumber ?? 0}:${resource.variant ?? 0}`,
    statusLabel,
    sortOrder: [-(resource.year ?? 0), SESSION_ORDER[session] ?? 9, paperNumber ?? 999, resource.variant ?? 999],
  };
}

export function groupExamResources(resources: ExamLibraryResource[]) {
  const subjects = new Map<number, { subjectId: number; subjectName: string; subjectCode: string; years: Map<number, { year: number; sessions: Map<string, SessionGroup> }> }>();
  for (const resource of resources) {
    const normalized = normalizeExamResource(resource);
    const subject = subjects.get(resource.subject_id) ?? { subjectId: resource.subject_id, subjectName: resource.subjects?.name ?? "Unknown subject", subjectCode: resource.subjects?.code ?? "", years: new Map() };
    subjects.set(resource.subject_id, subject);
    const yearKey = resource.year ?? 0;
    const year = subject.years.get(yearKey) ?? { year: yearKey, sessions: new Map<string, SessionGroup>() };
    subject.years.set(yearKey, year);
    const session = year.sessions.get(normalized.session) ?? { session: normalized.session, sessionLabel: normalized.sessionLabel, papers: new Map(), gradeThreshold: null, otherResources: [] };
    year.sessions.set(normalized.session, session);
    if (resource.resource_type === "GRADE_THRESHOLD") session.gradeThreshold = resource;
    else if (resource.resource_type === "PAST_PAPER" || resource.resource_type === "MARKING_SCHEME") {
      const pair = session.papers.get(normalized.examKey) ?? { paperNumber: normalized.paperNumber, variant: resource.variant, questionPaper: null, markingScheme: null };
      if (resource.resource_type === "PAST_PAPER") pair.questionPaper = resource;
      else pair.markingScheme = resource;
      session.papers.set(normalized.examKey, pair);
    } else session.otherResources.push(resource);
  }
  return [...subjects.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName)).map((subject) => ({
    ...subject,
    yearGroups: [...subject.years.values()].sort((a, b) => b.year - a.year).map((year) => ({
      year: year.year,
      sessions: [...year.sessions.values()].sort((a, b) => (SESSION_ORDER[a.session] ?? 9) - (SESSION_ORDER[b.session] ?? 9)).map((session) => ({
        ...session,
        papers: [...session.papers.values()].sort((a, b) => (a.paperNumber ?? 999) - (b.paperNumber ?? 999) || (a.variant ?? 999) - (b.variant ?? 999)),
        otherResources: session.otherResources.sort((a, b) => a.resource_type.localeCompare(b.resource_type) || a.original_filename.localeCompare(b.original_filename)),
      })),
    })),
  }));
}

export type ExamPair = { paperNumber: number | null; variant: number | null; questionPaper: ExamLibraryResource | null; markingScheme: ExamLibraryResource | null };
type SessionGroup = { session: string; sessionLabel: string; papers: Map<string, ExamPair>; gradeThreshold: ExamLibraryResource | null; otherResources: ExamLibraryResource[] };

export function pairStatus(pair: ExamPair) {
  if (!pair.questionPaper) return "Missing Question Paper";
  if (!pair.markingScheme) return "Missing Marking Scheme";
  const statuses = [normalizeExamResource(pair.questionPaper).statusLabel, normalizeExamResource(pair.markingScheme).statusLabel];
  return statuses.includes("Failed") ? "Failed" : statuses.includes("Needs Review") ? "Needs Review" : statuses.includes("Processing") ? "Processing" : "Processed";
}
