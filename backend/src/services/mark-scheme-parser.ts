/**
 * Deterministic Cambridge mark-scheme parser (F5).
 *
 * Cambridge mark schemes follow a consistent notation:
 *   - ';' separates independent MARKING POINTS (each typically worth 1 mark)
 *   - '/' or 'OR' separates acceptable ALTERNATIVES within a single point
 *   - codes M1/A1/B1/C1 label method / accuracy / independent / compensatory marks
 *   - explicit '(1)' or '[1]' after a point states its mark value
 *
 * Splitting on these turns a wall of text into discrete criteria the Paper Checker
 * can award against one-by-one — no AI needed, so it's cheap, deterministic and
 * explainable. Falls back gracefully for MCQ answers ("Correct option: B").
 */

export type MarkingPoint = {
  index: number;
  text: string;
  marks: number;
  code: string | null;          // M1 / A1 / B1 / C1 if present
  alternatives: string[];       // acceptable equivalents (from '/' or 'OR')
};

/** Split a marking point's text into acceptable alternatives ('/' or ' OR '). */
function splitAlternatives(text: string): string[] {
  return text
    .split(/\s+OR\s+|\s*\/\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function distribute(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  let remainder = total - base * n;
  return Array.from({ length: n }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return base + extra;
  });
}

/**
 * Parse a mark-scheme answer into discrete marking points.
 * `totalMarks` (from the question) is used to distribute marks when the scheme
 * doesn't state per-point values.
 */
export function parseMarkingPoints(schemeText: string, totalMarks: number | null): MarkingPoint[] {
  const clean = (schemeText ?? "").replace(/\r/g, "").trim();
  if (!clean) return [];

  // MCQ answer — a single point worth the whole question.
  const mcq = clean.match(/^(?:correct\s+(?:option|answer)\s*[:\-]?\s*)?([A-D])\b\.?$/i);
  if (mcq) {
    return [{ index: 1, text: `Correct option: ${mcq[1]!.toUpperCase()}`, marks: Math.max(1, totalMarks ?? 1), code: null, alternatives: [] }];
  }

  // Split into candidate points on ';' or line breaks (Cambridge point separators).
  const raw = clean
    .split(/\s*;\s*|\n+/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter((s) => s.length > 0);
  if (raw.length === 0) return [];

  const parsed = raw.map((text) => {
    const code = text.match(/\b([MABC][0-9])\b/)?.[1]?.toUpperCase() ?? null;
    const explicit = Number(text.match(/[\[(]\s*(\d+)\s*(?:marks?)?\s*[\])]/i)?.[1] ?? "0") || null;
    return { text, code, explicit };
  });

  const explicitSum = parsed.reduce((sum, p) => sum + (p.explicit ?? 0), 0);
  let marks: number[];
  if (explicitSum > 0) {
    marks = parsed.map((p) => p.explicit ?? 0);
  } else if (totalMarks && totalMarks > 0) {
    marks = distribute(totalMarks, parsed.length);
  } else {
    marks = parsed.map(() => 1);
  }

  return parsed.map((p, i) => ({
    index: i + 1,
    text: p.text,
    marks: marks[i]!,
    code: p.code,
    alternatives: splitAlternatives(p.text),
  }));
}

/** Render marking points as a compact criteria list for a marking prompt. */
export function formatMarkingCriteria(points: MarkingPoint[]): string {
  return points
    .map((p) => `${p.index}. [${p.marks} mark${p.marks === 1 ? "" : "s"}${p.code ? `, ${p.code}` : ""}] ${p.text}`)
    .join("\n");
}
