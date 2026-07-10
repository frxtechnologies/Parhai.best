import assert from "node:assert/strict";
import test from "node:test";
import { synthesizeIdealAnswer, exampleFromQuestion, exampleFromGoldLedger, contentHash } from "./dataset-builder";

const mp = (text: string, marks: number, alternatives: string[] = [text]) => ({ index: 1, text, marks, code: null, alternatives });

test("synthesizeIdealAnswer builds a grounded answer from mark points", () => {
  const out = synthesizeIdealAnswer([mp("F = ma", 1), mp("substitute values", 1)], null);
  assert.match(out, /official mark scheme/i);
  assert.match(out, /\[1 mark\] F = ma/);
  assert.match(out, /\[1 mark\] substitute values/);
});

test("synthesizeIdealAnswer falls back to answer text when no points", () => {
  assert.equal(synthesizeIdealAnswer([], "The answer is B."), "The answer is B.");
  assert.equal(synthesizeIdealAnswer([], null), "");
});

test("exampleFromQuestion returns a tagged example or null", () => {
  const ex = exampleFromQuestion(
    { clean_question_text: "State Newton's second law.", display_question_text: null, question_text: null, answer_text: "F = ma", marking_points: [mp("F = ma", 2)], taxonomy_topic_id: "phys.motion.forces", difficulty: "MEDIUM", total_marks: 2, marks: null },
    "0625",
  );
  assert.ok(ex);
  assert.equal(ex!.source, "question_corpus");
  assert.equal(ex!.topicId, "phys.motion.forces");
  assert.equal(ex!.marks, 2);
  assert.ok(ex!.output.includes("F = ma"));
  // No question text → null
  assert.equal(exampleFromQuestion({ clean_question_text: "", display_question_text: null, question_text: null, answer_text: "x", marking_points: [], taxonomy_topic_id: null, difficulty: null, total_marks: null, marks: null }, "0625"), null);
  // No answer and no scheme → null (never fabricate an output)
  assert.equal(exampleFromQuestion({ clean_question_text: "Q?", display_question_text: null, question_text: null, answer_text: null, marking_points: [], taxonomy_topic_id: null, difficulty: null, total_marks: null, marks: null }, "0625"), null);
});

test("exampleFromGoldLedger builds from a verified interaction", () => {
  const ex = exampleFromGoldLedger({ query_text: "Explain refraction", answer_text: "Bending of light...", subject_code: "0625", resolved_topic_id: "phys.waves.light", citations: ["[S1] ...", "[S2] ..."], model_name: "gemini-2.5-flash-lite" });
  assert.ok(ex);
  assert.equal(ex!.source, "gold_ledger");
  assert.equal(ex!.metadata.citations, 2);
  assert.equal(exampleFromGoldLedger({ query_text: "  ", answer_text: "x", subject_code: null, resolved_topic_id: null, citations: [], model_name: null }), null);
});

test("contentHash is stable and content-sensitive", () => {
  assert.equal(contentHash("a", "b"), contentHash("a", "b"));
  assert.notEqual(contentHash("a", "b"), contentHash("a", "c"));
});
