import assert from "node:assert/strict";
import test from "node:test";
import { previewPageAssessment } from "./question-screenshots";

test("rejects front covers and blank pages", () => {
  assert.equal(previewPageAssessment("INSTRUCTIONS INFORMATION Answer all questions. Write your name.", "2", "").reason, "front_page_detected");
  assert.equal(previewPageAssessment("BLANK PAGE", "2", "").reason, "blank_page_detected");
});

test("accepts the page containing the requested question heading", () => {
  const result = previewPageAssessment("2 (b) A ray of light enters a glass block. Calculate the critical angle.", "2(b)", "Calculate the critical angle for a ray of light in glass.");
  assert.equal(result.valid, true);
  assert.ok(result.score >= 0.75);
});

test("rejects a nonblank but unrelated nearby page", () => {
  const result = previewPageAssessment("7 Calculate the kinetic energy of the moving trolley using the data shown.", "2(b)", "Draw the refracted ray and calculate the critical angle.");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "page_match_failed");
});
