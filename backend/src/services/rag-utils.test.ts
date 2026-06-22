import assert from "node:assert/strict";
import test from "node:test";
import { expandSearchTerms, finalizeGroundedAnswer, formatCitation, rankEvidence } from "./rag-utils";

test("expands common topic aliases", () => {
  const terms = expandSearchTerms("Show electricity questions from 2024");
  assert.ok(terms.includes("electricity"));
  assert.ok(terms.includes("current"));
  assert.ok(terms.includes("circuit"));
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

test("accepts valid citations and rejects ungrounded answers", () => {
  assert.deepEqual(finalizeGroundedAnswer("Current is measured in amperes [Source 1].", 2, "missing"), { answer: "Current is measured in amperes [S1].", citedIndexes: [1] });
  assert.deepEqual(finalizeGroundedAnswer("Using general knowledge, current is measured in amperes.", 2, "missing"), { answer: "missing", citedIndexes: [] });
  assert.deepEqual(finalizeGroundedAnswer("Claim [S9].", 2, "missing"), { answer: "missing", citedIndexes: [] });
});
