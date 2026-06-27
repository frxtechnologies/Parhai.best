import assert from "node:assert/strict";
import test from "node:test";
import { detectCambridgeFilename } from "./cambridge-filename";

test("detects Cambridge paper, scheme, threshold, and session metadata", () => {
  assert.deepEqual(detectCambridgeFilename("4024_s23_qp_11.pdf"), {
    fileName: "4024_s23_qp_11.pdf", subjectCode: "4024", resourceType: "PAST_PAPER",
    year: 2023, session: "MAY_JUNE", paperNumber: 1, variant: 1, confidence: 100, warning: null,
  });
  assert.equal(detectCambridgeFilename("0625_w24_qp_22.pdf").session, "OCT_NOV");
  assert.equal(detectCambridgeFilename("0478_m23_ms_12.pdf").session, "FEB_MAR");
  assert.equal(detectCambridgeFilename("4024_s23_gt.pdf").resourceType, "GRADE_THRESHOLD");
});

test("marks malformed filenames for review", () => {
  assert.equal(detectCambridgeFilename("physics-paper.pdf").confidence, 0);
  assert.match(detectCambridgeFilename("4024_s23_qp.pdf").warning ?? "", /Paper and variant/);
});
