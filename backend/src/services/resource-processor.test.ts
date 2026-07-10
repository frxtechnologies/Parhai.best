import assert from "node:assert/strict";
import test from "node:test";
import { cleanQuestionText, questionTextQuality, splitNumberedQuestions } from "./resource-processor";

test("splits numbered questions and subparts without inventing content", () => {
  const rows = splitNumberedQuestions(`
    Question 1 Explain refraction through a glass lens. [3]
    (a) Draw the normal at the boundary. [1]
    (b) Calculate the refractive index. [2]
    Q2 State Ohm's law. (2 marks)
  `);
  assert.deepEqual(rows.map((row) => row.number), ["1", "1(a)", "1(b)", "2"]);
  assert.deepEqual(rows.map((row) => row.marks), [3, 1, 2, 2]);
  assert.match(rows[2]!.text, /refractive index/i);
});

test("merges repeated question headers into one database row", () => {
  const rows = splitNumberedQuestions("1 First page wording. [2]\n2 Another question. [1]\n1 Continued diagram wording.");
  assert.deepEqual(rows.map((row) => row.number), ["1", "2"]);
  assert.match(rows[0]!.text, /First page wording.*Continued diagram wording/);
});

test("sums every mark token in a combined question", () => {
  const rows = splitNumberedQuestions("1 (a) State the law. [2] (b) Calculate the value. [3] (c) Explain. [2] (d) Name the unit. [1]");
  assert.equal(rows[0]?.marks, 8);
});

test("removes PDF boilerplate and dotted answer-line garbage", () => {
  assert.equal(cleanQuestionText("DO NOT WRITE IN THIS MARGIN Explain refraction. ................................ UCLES TURN OVER"), "Explain refraction.");
});

test("removes Cambridge page codes while preserving equations and marks", () => {
  const cleaned = cleanQuestionText("Page 3 of 12 4024/12/M/J/23 * 000123 * Solve y = 2x + 3. [2]");
  assert.equal(cleaned, "Solve y = 2x + 3. [2]");
});

test("preserves maths and science notation (F13)", () => {
  const a = cleanQuestionText("Calculate F when a = 2 m/s^2, F = ma, 3 × 10⁸.");
  for (const token of ["m/s^2", "×", "10⁸"]) assert.ok(a.includes(token), `${token} missing in: ${a}`);
  const b = cleanQuestionText("Show θ ≤ 90° and v ≥ 0; 2H₂ + O₂ → 2H₂O.");
  for (const token of ["θ", "≤", "90°", "≥", "H₂", "→"]) assert.ok(b.includes(token), `${token} missing in: ${b}`);
});

test("still strips non-printable garbage (F13)", () => {
  assert.equal(cleanQuestionText("Define work.�​"), "Define work.");
});

test("rejects instruction text and verifies real command-word questions", () => {
  assert.equal(questionTextQuality("INSTRUCTIONS Answer all questions. Write your name."), "failed");
  assert.equal(questionTextQuality("Calculate the refractive index of the glass block and show all working clearly. [3]"), "good");
  assert.equal(questionTextQuality("glass block [1]"), "needs_review");
});
