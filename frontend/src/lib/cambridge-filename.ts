import JSZip from "jszip";

export type BulkResourceType = "PAST_PAPER" | "MARKING_SCHEME" | "GRADE_THRESHOLD" | "EXAMINER_REPORT" | "INSERT" | "SOURCE_FILE" | "SYLLABUS" | "NOTES" | "WORKSHEET";
export type BulkSession = "MAY_JUNE" | "OCT_NOV" | "FEB_MAR";

export type FilenameDetection = {
  fileName: string;
  subjectCode: string;
  resourceType: BulkResourceType | null;
  year: number | null;
  session: BulkSession | null;
  paperNumber: number | null;
  variant: number | null;
  confidence: number;
  warning: string | null;
};

const TYPE_MAP: Record<string, BulkResourceType> = {
  qp: "PAST_PAPER",
  ms: "MARKING_SCHEME",
  gt: "GRADE_THRESHOLD",
  er: "EXAMINER_REPORT",
  in: "INSERT",
  sf: "SOURCE_FILE",
  sy: "SYLLABUS",
};
const SESSION_MAP: Record<string, BulkSession> = { s: "MAY_JUNE", w: "OCT_NOV", m: "FEB_MAR" };

export function detectCambridgeFilename(fileName: string): FilenameDetection {
  const cleanName = fileName.split(/[\\/]/).pop() ?? fileName;
  const match = cleanName.match(/^(\d{4})_([swm])(\d{2})_(qp|ms|gt|er|in|sf|sy)(?:_(\d{2}))?\.pdf$/i);
  if (!match) return { fileName: cleanName, subjectCode: "", resourceType: null, year: null, session: null, paperNumber: null, variant: null, confidence: 0, warning: "Filename does not match the Cambridge format." };
  const resourceType = TYPE_MAP[match[4]!.toLowerCase()]!;
  const paperVariant = match[5] ?? null;
  const paperNumber = paperVariant ? Number(paperVariant[0]) : null;
  const variant = paperVariant ? Number(paperVariant[1]) : null;
  const needsPaper = resourceType === "PAST_PAPER" || resourceType === "MARKING_SCHEME";
  const warning = needsPaper && !paperVariant ? "Paper and variant are required for question papers and marking schemes." : null;
  return {
    fileName: cleanName,
    subjectCode: match[1]!,
    resourceType,
    year: 2000 + Number(match[3]),
    session: SESSION_MAP[match[2]!.toLowerCase()]!,
    paperNumber,
    variant,
    confidence: warning ? 75 : 100,
    warning,
  };
}

export async function sha256File(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function expandBulkFiles(files: File[]) {
  const output: File[] = [];
  for (const file of files) {
    if (/\.pdf$/i.test(file.name)) { output.push(file); continue; }
    if (!/\.zip$/i.test(file.name)) continue;
    const zip = await JSZip.loadAsync(file);
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const blob = await entry.async("blob");
      const name=entry.name.split("/").pop()!;
      output.push(new File([blob], name, { type: /\.pdf$/i.test(name)?"application/pdf":"application/octet-stream", lastModified: file.lastModified }));
    }
  }
  return output;
}
