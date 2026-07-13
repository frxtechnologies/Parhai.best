import assert from "node:assert/strict";
import test from "node:test";
import { rankWeakTopics, findMissingResourceTypes, computeApiDependency, buildSuggestedUploads } from "./intelligence-insights";

test("rankWeakTopics flags low-coverage topics, worst first", () => {
  const ranked = rankWeakTopics([
    { topicId: "a", name: "Forces", questionCount: 2, needsReviewCount: 0 },
    { topicId: "b", name: "Light", questionCount: 20, needsReviewCount: 0 },
    { topicId: "c", name: "Waves", questionCount: 0, needsReviewCount: 0 },
  ]);
  assert.equal(ranked.length, 2); // Light is healthy, excluded
  assert.equal(ranked[0]!.topicId, "c"); // 0 questions is worse than 2
  assert.equal(ranked[0]!.reason, "low_coverage");
});

test("rankWeakTopics flags high needs_review rate even with enough questions", () => {
  const ranked = rankWeakTopics([{ topicId: "a", name: "Circuits", questionCount: 20, needsReviewCount: 15 }]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.reason, "high_review_rate");
  assert.ok(ranked[0]!.severity >= 0.7);
});

test("findMissingResourceTypes reports core gaps separately from recommended", () => {
  const missing = findMissingResourceTypes(new Set(["PAST_PAPER"]));
  const core = missing.filter((m) => m.tier === "core").map((m) => m.resourceType);
  assert.deepEqual(core, ["MARKING_SCHEME", "EXAMINER_REPORT", "GRADE_THRESHOLD"]);
  assert.ok(missing.some((m) => m.resourceType === "TEACHER_NOTES" && m.tier === "recommended"));
});

test("findMissingResourceTypes reports nothing when fully covered", () => {
  const all = new Set(["PAST_PAPER", "MARKING_SCHEME", "EXAMINER_REPORT", "GRADE_THRESHOLD", "TEACHER_NOTES", "FORMULA_SHEET"]);
  assert.deepEqual(findMissingResourceTypes(all), []);
});

test("computeApiDependency reports the local-model rate — the mission's core KPI", () => {
  const dep = computeApiDependency({ local: 70, api: 20, keyword: 10, none: 0 });
  assert.equal(dep.total, 100);
  assert.equal(dep.localRate, 0.7);
  assert.equal(dep.apiRate, 0.2);
});

test("computeApiDependency handles zero traffic without dividing by zero", () => {
  assert.deepEqual(computeApiDependency({ local: 0, api: 0, keyword: 0, none: 0 }), { localRate: 0, apiRate: 0, keywordRate: 0, noneRate: 0, total: 0 });
});

test("buildSuggestedUploads produces actionable, prioritized messages", () => {
  const suggestions = buildSuggestedUploads(
    5, "Physics",
    [{ topicId: "a", name: "Forces", questionCount: 1, needsReviewCount: 0, reason: "low_coverage", severity: 0.9 }],
    [{ resourceType: "MARKING_SCHEME", tier: "core" }],
  );
  assert.ok(suggestions[0]!.priority === "high");
  assert.match(suggestions.find((s) => s.message.includes("marking scheme"))!.message, /Physics has no marking scheme/i);
  assert.match(suggestions.find((s) => s.message.includes("Forces"))!.message, /only 1 question/);
});
