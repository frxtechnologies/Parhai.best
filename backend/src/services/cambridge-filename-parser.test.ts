import assert from "node:assert/strict";
import test from "node:test";
import { parseCambridgeFilename, parseCambridgeFilenames } from "./cambridge-filename-parser";

test("parses a question paper with paper number and variant", () => {
  const m = parseCambridgeFilename("0625_s24_qp_22.pdf");
  assert.deepEqual(m, { syllabusCode: "0625", session: "MAY_JUNE", year: 2024, resourceType: "PAST_PAPER", paperNumber: 2, variant: 2, confidence: 1.0 });
});

test("parses a mark scheme from the Oct/Nov session", () => {
  const m = parseCambridgeFilename("0625_w23_ms_11.pdf");
  assert.equal(m?.session, "OCT_NOV");
  assert.equal(m?.year, 2023);
  assert.equal(m?.resourceType, "MARKING_SCHEME");
  assert.equal(m?.paperNumber, 1);
  assert.equal(m?.variant, 1);
});

test("parses an examiner report / grade threshold with no paper number", () => {
  const er = parseCambridgeFilename("0625_s24_er.pdf");
  assert.equal(er?.resourceType, "EXAMINER_REPORT");
  assert.equal(er?.paperNumber, null);
  const gt = parseCambridgeFilename("4024_s24_gt.pdf");
  assert.equal(gt?.resourceType, "GRADE_THRESHOLD");
  assert.equal(gt?.syllabusCode, "4024");
});

test("parses specimen papers (y session, no fixed session)", () => {
  const m = parseCambridgeFilename("0625_y24_sp_1.pdf");
  assert.equal(m?.resourceType, "SPECIMEN_PAPER");
  assert.equal(m?.session, null);
  assert.equal(m?.paperNumber, 1);
  assert.equal(m?.variant, null);
});

test("handles a nested path / extra prefix around the convention", () => {
  const m = parseCambridgeFilename("uploads/2024/0625_s24_qp_22.pdf");
  assert.ok(m);
  assert.equal(m?.syllabusCode, "0625");
});

test("returns null for non-standard filenames (caller falls back to AI/manual)", () => {
  assert.equal(parseCambridgeFilename("my scanned physics paper.pdf"), null);
  assert.equal(parseCambridgeFilename("teacher-notes-forces.pdf"), null);
  assert.equal(parseCambridgeFilename("0625_2024_questions.pdf"), null); // wrong shape
});

test("batch parse preserves order and nulls", () => {
  const results = parseCambridgeFilenames(["0625_s24_qp_22.pdf", "random.pdf", "0625_s24_ms_22.pdf"]);
  assert.equal(results.length, 3);
  assert.ok(results[0]);
  assert.equal(results[1], null);
  assert.ok(results[2]);
});
