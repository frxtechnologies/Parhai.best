import assert from "node:assert/strict";
import test from "node:test";
import { buildRevisionPlan } from "./revision-planner";

const NOW = new Date("2026-01-01T09:00:00Z");

test("schedules study days from today up to the day before the exam", () => {
  const plan = buildRevisionPlan(
    { examDate: "2026-01-15", subjects: ["Physics", "Mathematics"], hoursPerDay: 2, studyDaysPerWeek: 7 },
    NOW,
  );
  assert.equal(plan.daysUntilExam, 14);
  assert.equal(plan.totalDays, 14);
  assert.equal(plan.days.length, 14);
  // With 7 study days a week there are no rest days.
  assert.equal(plan.studyDays, 14);
  // Plan never includes the exam day itself.
  assert.ok(plan.days.every((day) => day.date < "2026-01-15"));
});

test("rejects an exam date that is not in the future", () => {
  assert.throws(() => buildRevisionPlan({ examDate: "2025-12-31", subjects: ["Physics"] }, NOW), /future/i);
  assert.throws(() => buildRevisionPlan({ examDate: "2026-01-01", subjects: ["Physics"] }, NOW), /future/i);
});

test("requires at least one subject", () => {
  assert.throws(() => buildRevisionPlan({ examDate: "2026-02-01", subjects: [] }, NOW), /subject/i);
  assert.throws(() => buildRevisionPlan({ examDate: "2026-02-01", subjects: ["   "] }, NOW), /subject/i);
});

test("inserts weekly rest days when studying fewer than seven days a week", () => {
  const plan = buildRevisionPlan(
    { examDate: "2026-01-22", subjects: ["Physics"], studyDaysPerWeek: 6 },
    NOW,
  );
  const restDays = plan.days.filter((day) => day.isRestDay);
  assert.ok(restDays.length >= 2, "expected at least two rest days across three weeks");
  // Rest days carry no study sessions.
  assert.ok(restDays.every((day) => day.sessions.length === 0 && day.totalMinutes === 0));
});

test("moves through foundation, practice and final-review phases", () => {
  const plan = buildRevisionPlan(
    { examDate: "2026-02-10", subjects: ["Physics", "Chemistry"], studyDaysPerWeek: 7 },
    NOW,
  );
  const phases = new Set(plan.days.map((day) => day.phase));
  assert.ok(phases.has("foundation"));
  assert.ok(phases.has("practice"));
  assert.ok(phases.has("final_review"));
  // The final phase must schedule at least one full mock paper.
  const hasMock = plan.days.some((day) => day.sessions.some((s) => s.activity === "mock_paper"));
  assert.ok(hasMock, "final review should include a mock paper");
});

test("prioritises weak topics in the study focus", () => {
  const plan = buildRevisionPlan(
    { examDate: "2026-01-20", subjects: ["Physics"], weakTopics: ["Momentum", "Electromagnetism"], studyDaysPerWeek: 7 },
    NOW,
  );
  const focuses = plan.days.flatMap((day) => day.sessions.map((s) => s.focus));
  assert.ok(focuses.includes("Momentum"));
  assert.ok(focuses.includes("Electromagnetism"));
});

test("respects available hours per day when sizing sessions", () => {
  const plan = buildRevisionPlan(
    { examDate: "2026-01-10", subjects: ["Physics"], hoursPerDay: 3, studyDaysPerWeek: 7 },
    NOW,
  );
  const firstStudyDay = plan.days.find((day) => !day.isRestDay)!;
  assert.equal(firstStudyDay.totalMinutes, 180);
});

test("caps far-off exams to the planning horizon but keeps the real countdown", () => {
  const plan = buildRevisionPlan(
    { examDate: "2026-12-31", subjects: ["Physics"], studyDaysPerWeek: 7 },
    NOW,
  );
  assert.ok(plan.daysUntilExam > 90);
  assert.equal(plan.totalDays, 90);
  assert.equal(plan.days.length, 90);
  // The plan window ends the day before the exam.
  assert.equal(plan.days[plan.days.length - 1]!.date, "2026-12-30");
});

test("is deterministic for the same input and clock", () => {
  const input = { examDate: "2026-02-01", subjects: ["Physics", "Maths"], weakTopics: ["Waves"] };
  assert.deepEqual(buildRevisionPlan(input, NOW), buildRevisionPlan(input, NOW));
});
