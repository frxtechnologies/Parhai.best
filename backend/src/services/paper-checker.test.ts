import assert from "node:assert/strict";
import test from "node:test";
import { aggregatePaperResult, estimateGrade, normalizeMarkedQuestions, type MarkedQuestion } from "./paper-checker";

test("maps percentages to Cambridge-style grade boundaries", () => {
  assert.equal(estimateGrade(95), "A*");
  assert.equal(estimateGrade(90), "A*");
  assert.equal(estimateGrade(85), "A");
  assert.equal(estimateGrade(72), "B");
  assert.equal(estimateGrade(61), "C");
  assert.equal(estimateGrade(55), "D");
  assert.equal(estimateGrade(42), "E");
  assert.equal(estimateGrade(30), "U");
  assert.equal(estimateGrade(0), "U");
});

test("clamps out-of-range percentages", () => {
  assert.equal(estimateGrade(150), "A*");
  assert.equal(estimateGrade(-10), "U");
});

const questions: MarkedQuestion[] = [
  { questionNumber: "1", topic: "Momentum", awardedMarks: 4, totalMarks: 4, whatWentWell: "", missingPoints: "", modelAnswer: "" },
  { questionNumber: "2", topic: "Momentum", awardedMarks: 1, totalMarks: 4, whatWentWell: "", missingPoints: "", modelAnswer: "" },
  { questionNumber: "3", topic: "Electricity", awardedMarks: 3, totalMarks: 4, whatWentWell: "", missingPoints: "", modelAnswer: "" },
];

test("aggregates totals, percentage and grade deterministically", () => {
  const result = aggregatePaperResult(questions);
  assert.equal(result.totalAwarded, 8);
  assert.equal(result.totalPossible, 12);
  assert.equal(result.percentage, 67);
  assert.equal(result.grade, "C");
});

test("classifies strong and weak topics by ratio", () => {
  const result = aggregatePaperResult(questions);
  // Momentum: 5/8 = 0.63 overall (not strong, not weak); Electricity: 3/4 = 0.75 (strong).
  assert.deepEqual(result.strongTopics, ["Electricity"]);
  // No topic is below 0.5 overall here.
  assert.deepEqual(result.weakTopics, []);
});

test("never awards more marks than are available", () => {
  const result = aggregatePaperResult([
    { questionNumber: "1", topic: "X", awardedMarks: 99, totalMarks: 5, whatWentWell: "", missingPoints: "", modelAnswer: "" },
  ]);
  assert.equal(result.totalAwarded, 5);
  assert.equal(result.percentage, 100);
});

test("handles an empty paper without dividing by zero", () => {
  const result = aggregatePaperResult([]);
  assert.equal(result.totalPossible, 0);
  assert.equal(result.percentage, 0);
  assert.equal(result.grade, "U");
});

test("normalizes malformed marking output", () => {
  const result = normalizeMarkedQuestions([
    { questionNumber: 5, awardedMarks: "3", totalMarks: "4", topic: " Waves " },
    { awardedMarks: -2, totalMarks: "abc" },
    null,
  ]);
  assert.equal(result[0]!.questionNumber, "5");
  assert.equal(result[0]!.awardedMarks, 3);
  assert.equal(result[0]!.totalMarks, 4);
  assert.equal(result[0]!.topic, "Waves");
  assert.equal(result[1]!.awardedMarks, 0);
  assert.equal(result[1]!.totalMarks, 0);
  assert.equal(result[2]!.questionNumber, "?");
});
