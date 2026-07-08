import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExtraction, OCR_CONFIDENCE_THRESHOLD } from "./question-solver";

test("normalizes a well-formed extraction payload", () => {
  const result = normalizeExtraction({
    questionText: "  Calculate the momentum of a 2 kg ball moving at 3 m/s.  ",
    subjectGuess: "Physics",
    paper: "5054/21",
    marks: "3",
    topic: "Momentum",
    hasEquations: true,
    hasDiagram: false,
    confidence: 0.92,
  });
  assert.equal(result.questionText, "Calculate the momentum of a 2 kg ball moving at 3 m/s.");
  assert.equal(result.subjectGuess, "Physics");
  assert.equal(result.marks, 3);
  assert.equal(result.hasEquations, true);
  assert.equal(result.confidence, 0.92);
});

test("clamps out-of-range confidence into 0..1", () => {
  assert.equal(normalizeExtraction({ confidence: 1.8 }).confidence, 1);
  assert.equal(normalizeExtraction({ confidence: -0.5 }).confidence, 0);
  assert.equal(normalizeExtraction({ confidence: "not a number" }).confidence, 0);
});

test("treats blank or invalid fields as null", () => {
  const result = normalizeExtraction({ questionText: "", subjectGuess: "   ", marks: 0, topic: null });
  assert.equal(result.questionText, "");
  assert.equal(result.subjectGuess, null);
  assert.equal(result.marks, null);
  assert.equal(result.topic, null);
});

test("low confidence sits below the retake threshold", () => {
  // A blurry capture the model is unsure about must fall under the threshold.
  assert.ok(normalizeExtraction({ questionText: "partial", confidence: 0.3 }).confidence < OCR_CONFIDENCE_THRESHOLD);
  assert.ok(normalizeExtraction({ questionText: "clear", confidence: 0.8 }).confidence >= OCR_CONFIDENCE_THRESHOLD);
});
