import assert from "node:assert/strict";
import test from "node:test";
import { assistantModeFor, cambridgeTeacherName, finalizeTeacherAnswer, requestedOutsideSubject } from "./teacher-mode";

test("selects teacher, hybrid, and evidence-only RAG modes", () => {
  assert.equal(assistantModeFor("Give me an exam technique"), "hybrid");
  assert.equal(assistantModeFor("Explain refraction"), "hybrid");
  assert.equal(assistantModeFor("Which past paper had refraction in 2024?"), "rag");
  assert.equal(assistantModeFor("Help me study"), "teacher");
});

test("creates subject-specific teacher identities and blocks other subjects", () => {
  assert.equal(cambridgeTeacherName("Maths"), "Cambridge Mathematics Teacher");
  assert.equal(cambridgeTeacherName("Physics"), "Cambridge Physics Teacher");
  assert.equal(requestedOutsideSubject("Explain chemistry bonding", "Physics"), true);
  assert.equal(requestedOutsideSubject("Explain forces", "Physics"), false);
});

test("keeps only valid evidence markers in teacher answers", () => {
  const result = finalizeTeacherAnswer("Explanation [S1]\nBad [S9]", 2, "hybrid");
  assert.deepEqual(result.citedIndexes, [1]);
  assert.equal(result.answer.includes("[S9]"), false);
});
