import assert from "node:assert/strict";
import test from "node:test";
import { computeInitialQuality, isGoldReady } from "./gold-promotion";

test("computeInitialQuality rewards grounded, cited, topic-filtered answers", () => {
  const strong = computeInitialQuality({ mode: "rag", citationsCount: 4, topSimilarity: 0.7, retrievalStrategy: "taxonomy_exact" });
  const weak = computeInitialQuality({ mode: "teacher", citationsCount: 0, topSimilarity: null, retrievalStrategy: "semantic_only" });
  assert.ok(strong > weak, `${strong} !> ${weak}`);
  assert.ok(strong >= 0.9, `strong=${strong}`);
  assert.equal(weak, 0.3);
  assert.ok(strong <= 1);
});

test("isGoldReady enforces the quality gate", () => {
  assert.equal(isGoldReady({ verification_status: "teacher_verified", quality_score: 0.1 }), true);
  assert.equal(isGoldReady({ verification_status: "rejected", quality_score: 0.99 }), false);
  assert.equal(isGoldReady({ verification_status: "student_negative", quality_score: 0.99 }), false);
  assert.equal(isGoldReady({ verification_status: "unverified", quality_score: 0.99 }), false);
  assert.equal(isGoldReady({ verification_status: "student_positive", quality_score: 0.8 }), true);
  assert.equal(isGoldReady({ verification_status: "student_positive", quality_score: 0.5 }), false);
});
