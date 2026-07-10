/**
 * Gold promotion (Phase B) — the training-data quality gate.
 *
 * A ledger row is a raw training CANDIDATE. It becomes GOLD (eligible for the
 * training set) only when it clears this gate. The rules are deterministic and
 * explainable so the corpus never silently trains on the model's own
 * hallucinations. Two inputs decide it:
 *   1. a capture-time quality score (how well-grounded the answer was), and
 *   2. verification signal (teacher confirmation, or a strong student signal).
 */

export type CaptureSignals = {
  mode: string;                 // rag | hybrid | teacher
  citationsCount: number;       // how many evidence sources were actually cited
  topSimilarity: number | null; // best semantic match among evidence
  retrievalStrategy: string;    // taxonomy_exact | taxonomy_parent | ... | semantic_only
};

/**
 * Capture-time quality score in [0,1]: how trustworthy the answer looks based on
 * grounding, independent of any human rating. Evidence-locked (rag) answers that
 * actually cite topic-filtered sources score highest.
 */
export function computeInitialQuality(s: CaptureSignals): number {
  let score = 0.3; // base for any completed answer
  if (s.mode === "rag") score += 0.2;                       // evidence-locked mode
  if (s.citationsCount > 0) score += 0.25;                  // grounded in real sources
  if (s.citationsCount >= 3) score += 0.05;
  if ((s.topSimilarity ?? 0) >= 0.5) score += 0.1;          // strong semantic match
  if (s.retrievalStrategy.startsWith("taxonomy")) score += 0.1; // topic-filtered retrieval
  return Math.min(1, Math.round(score * 100) / 100);
}

const AUTO_GOLD_QUALITY = Number(process.env.GOLD_AUTO_QUALITY ?? "0.7");

export type LedgerVerification = {
  verification_status: string;
  quality_score: number | null;
};

/**
 * Is this row eligible for the training set?
 *   - teacher_verified  → always gold
 *   - rejected          → never
 *   - student_positive  → gold only if the capture-time quality clears the bar
 *   - unverified / student_negative → not yet
 */
export function isGoldReady(row: LedgerVerification): boolean {
  switch (row.verification_status) {
    case "teacher_verified":
      return true;
    case "rejected":
    case "student_negative":
      return false;
    case "student_positive":
      return (row.quality_score ?? 0) >= AUTO_GOLD_QUALITY;
    default:
      return false; // unverified
  }
}
