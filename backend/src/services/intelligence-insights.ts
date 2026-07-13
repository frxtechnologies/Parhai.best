/**
 * Intelligence Insights — the platform answering its own question: "what does
 * Parhai need to get smarter?" Every insight here is derived deterministically
 * from data the platform already has (taxonomy coverage, resource inventory,
 * retrieval telemetry) — no new AI calls, no new cost, just reading what the
 * system already knows about itself.
 */

export type TopicCoverage = { topicId: string; name: string; questionCount: number; needsReviewCount: number };
export type WeakTopic = TopicCoverage & { reason: "low_coverage" | "high_review_rate"; severity: number };

const MIN_HEALTHY_QUESTIONS = 8;
const MAX_HEALTHY_REVIEW_RATE = 0.4;

/**
 * Rank taxonomy topics by how much they need attention. A topic is weak if it
 * has too few questions to ground answers well, or too many of its questions
 * are still needs_review (i.e. the classifier/OCR pipeline is unsure about them).
 * Severity is a 0-1 score so callers can show "how weak", not just a yes/no.
 */
export function rankWeakTopics(topics: TopicCoverage[]): WeakTopic[] {
  const weak: WeakTopic[] = [];
  for (const t of topics) {
    const reviewRate = t.questionCount > 0 ? t.needsReviewCount / t.questionCount : 1;
    if (t.questionCount < MIN_HEALTHY_QUESTIONS) {
      weak.push({ ...t, reason: "low_coverage", severity: 1 - Math.min(1, t.questionCount / MIN_HEALTHY_QUESTIONS) });
    } else if (reviewRate > MAX_HEALTHY_REVIEW_RATE) {
      weak.push({ ...t, reason: "high_review_rate", severity: Math.min(1, reviewRate) });
    }
  }
  return weak.sort((a, b) => b.severity - a.severity);
}

/** The resource types every well-supported subject should have at least some of. */
export const CORE_RESOURCE_TYPES = ["PAST_PAPER", "MARKING_SCHEME", "EXAMINER_REPORT", "GRADE_THRESHOLD"] as const;
export const RECOMMENDED_RESOURCE_TYPES = ["TEACHER_NOTES", "FORMULA_SHEET"] as const;

export type MissingResourceType = { resourceType: string; tier: "core" | "recommended" };

/** Which of the core/recommended resource types a subject has zero of. */
export function findMissingResourceTypes(existingTypes: Set<string>): MissingResourceType[] {
  const missing: MissingResourceType[] = [];
  for (const t of CORE_RESOURCE_TYPES) if (!existingTypes.has(t)) missing.push({ resourceType: t, tier: "core" });
  for (const t of RECOMMENDED_RESOURCE_TYPES) if (!existingTypes.has(t)) missing.push({ resourceType: t, tier: "recommended" });
  return missing;
}

export type ApiDependency = { localRate: number; apiRate: number; keywordRate: number; noneRate: number; total: number };

/**
 * The platform's core "how independent are we from commercial APIs" metric.
 * localRate is the fraction of topic classifications the Parhai-owned model
 * answered without ever calling out to Gemini — this is the number that should
 * trend upward over time as the mission succeeds.
 */
export function computeApiDependency(counts: { local: number; api: number; keyword: number; none: number }): ApiDependency {
  const total = counts.local + counts.api + counts.keyword + counts.none;
  if (total === 0) return { localRate: 0, apiRate: 0, keywordRate: 0, noneRate: 0, total: 0 };
  return {
    localRate: counts.local / total, apiRate: counts.api / total,
    keywordRate: counts.keyword / total, noneRate: counts.none / total, total,
  };
}

export type SuggestedUpload = { subjectId: number; message: string; priority: "high" | "medium" };

/** Turn weak topics + missing resource types into a plain-English action list for admins. */
export function buildSuggestedUploads(subjectId: number, subjectName: string, weakTopics: WeakTopic[], missing: MissingResourceType[]): SuggestedUpload[] {
  const suggestions: SuggestedUpload[] = [];
  for (const m of missing) {
    suggestions.push({
      subjectId, priority: m.tier === "core" ? "high" : "medium",
      message: `${subjectName} has no ${m.resourceType.replace(/_/g, " ").toLowerCase()} uploaded yet.`,
    });
  }
  for (const t of weakTopics.slice(0, 5)) {
    suggestions.push({
      subjectId, priority: t.severity > 0.7 ? "high" : "medium",
      message: t.reason === "low_coverage"
        ? `${t.name} has only ${t.questionCount} question${t.questionCount === 1 ? "" : "s"} — upload more past papers covering this topic.`
        : `${t.name} has ${t.needsReviewCount} of ${t.questionCount} questions still needing review — check classification quality.`,
    });
  }
  return suggestions.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1));
}
