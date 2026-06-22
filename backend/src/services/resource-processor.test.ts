import assert from "node:assert/strict";
import test from "node:test";
import { splitNumberedQuestions } from "./resource-processor";

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
