/**
 * Deterministic parser for Cambridge's standard exam-file naming convention.
 * No AI, no network call — this is the primary auto-detection path for bulk
 * upload; AI/manual classification is only the fallback for non-standard names.
 *
 * Convention: {syllabus}_{session}{yy}_{type}_{paper}{variant}.ext
 *   syllabus  4-digit subject code, e.g. 0625, 5054, 4024, 5070
 *   session   s = May/June, w = Oct/Nov, m = Feb/March, y = specimen (no fixed session)
 *   yy        2-digit year
 *   type      qp question paper · ms mark scheme · er examiner report ·
 *             gt grade thresholds · ir insert · ci confidential instructions ·
 *             sp specimen paper · sm specimen mark scheme · su syllabus update
 *   paper     1-2 digits: first = paper number, second (if present) = variant
 *
 * Real examples: 0625_s24_qp_22.pdf, 0625_w23_ms_11.pdf, 0625_s24_er.pdf,
 *                0625_y24_sp_1.pdf, 4024_s24_gt.pdf
 */

export type CambridgeFilenameMatch = {
  syllabusCode: string;
  session: "MAY_JUNE" | "OCT_NOV" | "FEB_MAR" | null;
  year: number;
  resourceType: string;
  paperNumber: number | null;
  variant: number | null;
  confidence: number; // 1.0 = fully matched the convention, lower = partial
};

const SESSION_MAP: Record<string, CambridgeFilenameMatch["session"]> = {
  s: "MAY_JUNE", w: "OCT_NOV", m: "FEB_MAR", y: null,
};

const TYPE_MAP: Record<string, string> = {
  qp: "PAST_PAPER", ms: "MARKING_SCHEME", er: "EXAMINER_REPORT", gt: "GRADE_THRESHOLD",
  ir: "INSERT", ci: "OTHER", sp: "SPECIMEN_PAPER", sm: "SPECIMEN_PAPER", su: "SYLLABUS",
};

const PATTERN = /(\d{4})_([smwy])(\d{2})_([a-z]{2})(?:_(\d{1,2}))?/i;

/** Full two-digit year → 4-digit, assuming 00-79 = 2000s, 80-99 = 1900s. */
function fullYear(yy: number): number {
  return yy <= 79 ? 2000 + yy : 1900 + yy;
}

/**
 * Parse one filename. Returns null if it doesn't match the Cambridge convention
 * at all (caller should fall back to AI/manual classification for that file).
 */
export function parseCambridgeFilename(filename: string): CambridgeFilenameMatch | null {
  const stem = filename.replace(/\.[a-z0-9]+$/i, "");
  const match = stem.match(PATTERN);
  if (!match) return null;

  const [, syllabus, sessionCode, yy, typeCode, paperDigits] = match;
  const resourceType = TYPE_MAP[typeCode!.toLowerCase()];
  if (!resourceType) return null;

  let paperNumber: number | null = null;
  let variant: number | null = null;
  if (paperDigits) {
    if (paperDigits.length === 2) { paperNumber = Number(paperDigits[0]); variant = Number(paperDigits[1]); }
    else { paperNumber = Number(paperDigits); }
  }

  return {
    syllabusCode: syllabus!,
    session: SESSION_MAP[sessionCode!.toLowerCase()] ?? null,
    year: fullYear(Number(yy)),
    resourceType,
    paperNumber,
    variant,
    confidence: 1.0,
  };
}

/** Parse a batch of filenames (bulk upload queue). Order-preserving; null entries need manual/AI classification. */
export function parseCambridgeFilenames(filenames: string[]): Array<CambridgeFilenameMatch | null> {
  return filenames.map(parseCambridgeFilename);
}
