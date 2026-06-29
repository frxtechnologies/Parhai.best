import assert from "node:assert/strict";
import test from "node:test";
import { detectRequestedTopic, expandSearchTerms, finalizeGroundedAnswer, formatCitation, formatQuestionResultSummary, rankEvidence } from "./rag-utils";

test("expands common topic aliases", () => {
  const terms = expandSearchTerms("Show electricity questions from 2024");
  assert.ok(terms.includes("electricity"));
  assert.ok(terms.includes("current"));
  assert.ok(terms.includes("circuit"));
});

test("normalizes Maths circle aliases and common typo", () => {
  const terms = expandSearchTerms("give me ciruces topic questions");
  for (const expected of ["circles", "circle", "circle theorem", "cyclic quadrilateral", "tangent", "chord", "radius", "diameter", "arc", "sector"]) {
    assert.ok(terms.includes(expected), `missing ${expected}`);
  }
});

test("formats complete exam citations", () => {
  assert.equal(
    formatCitation({ name: "Physics", code: "5054" }, { session: "MAY_JUNE", year: 2024, paperCode: "2", variant: 2, questionNumber: "5", sourceFile: "5054_s24_qp_22.pdf" }),
    "Physics 5054 · May/June · 2024 · Paper 2 · Variant 2 · Question 5 · File: 5054_s24_qp_22.pdf",
  );
});

test("ranks exact topic matches above unrelated semantic chunks", () => {
  const sources = rankEvidence([
    { reference: "Thermal notes", content: "gas pressure", metadata: { similarity: 0.9, topic: "Thermal Physics" } },
    { reference: "Question 4", content: "calculate circuit current", metadata: { similarity: 0.2, topic: "Electricity", questionNumber: "4" } },
  ], expandSearchTerms("electricity circuit"));
  assert.equal(sources[0]!.reference, "Question 4");
});

test("ranks substantial questions above one-mark questions for hardest requests", () => {
  const ranked = rankEvidence([
    { reference: "Q1", content: "State the energy type.", metadata: { topic: "Energy", difficulty: "HARD", marks: 1, questionNumber: "1", confidence: 0.9 } },
    { reference: "Q6", content: "Calculate the energy transfer and explain the efficiency.", metadata: { topic: "Energy", difficulty: "MEDIUM", marks: 6, questionNumber: "6(a)", confidence: 0.9 } },
  ], expandSearchTerms("Give me the hardest Energy questions"));
  assert.equal(ranked[0]!.reference, "Q6");
});

test("result wording never displays more questions than remain after deduplication", () => {
  assert.equal(formatQuestionResultSummary(5, 1, 6), "Found 5 possible matches. Removed 1 repeated/similar question. Showing the 4 best results.");
});

test("detects strict Physics refraction and Maths graph scopes", () => {
  assert.deepEqual(detectRequestedTopic("Show refraction and total internal reflection questions", "5054")?.topic, "Light");
  assert.deepEqual(detectRequestedTopic("Give me graph questions from 2023", "4024")?.topic, "Graphs and Functions");
  assert.deepEqual(detectRequestedTopic("Give me ciruces questions", "4024")?.subtopics, ["Circle Theorems"]);
});

test("accepts valid citations and rejects ungrounded answers", () => {
  assert.deepEqual(finalizeGroundedAnswer("Current is measured in amperes [Source 1].", 2, "missing"), { answer: "Current is measured in amperes [S1].", citedIndexes: [1] });
  assert.deepEqual(finalizeGroundedAnswer("Using general knowledge, current is measured in amperes.", 2, "missing"), { answer: "missing", citedIndexes: [] });
  assert.deepEqual(finalizeGroundedAnswer("Claim [S9].", 2, "missing"), { answer: "missing", citedIndexes: [] });
});
