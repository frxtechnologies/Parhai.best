import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkingPoints, formatMarkingCriteria } from "./mark-scheme-parser";

test("splits Cambridge ';'-separated marking points and distributes marks", () => {
  const pts = parseMarkingPoints("correct equation F = ma; substitution 1200 x 2; force = 2400 N", 3);
  assert.equal(pts.length, 3);
  assert.deepEqual(pts.map((p) => p.marks), [1, 1, 1]);
  assert.equal(pts[0]!.text, "correct equation F = ma");
});

test("handles MCQ answers as a single point worth the question", () => {
  assert.deepEqual(parseMarkingPoints("Correct option: B", 1), [
    { index: 1, text: "Correct option: B", marks: 1, code: null, alternatives: [] },
  ]);
  assert.equal(parseMarkingPoints("C", 2)[0]!.marks, 2);
});

test("respects explicit per-point marks and M/A/B codes", () => {
  const pts = parseMarkingPoints("states correct method M1 (1); correct answer 5.0 A1 (2)", null);
  assert.deepEqual(pts.map((p) => p.marks), [1, 2]);
  assert.equal(pts[0]!.code, "M1");
  assert.equal(pts[1]!.code, "A1");
});

test("captures acceptable alternatives from / and OR", () => {
  const pts = parseMarkingPoints("kinetic energy / KE OR energy of movement", 1);
  assert.equal(pts.length, 1);
  assert.deepEqual(pts[0]!.alternatives, ["kinetic energy", "KE", "energy of movement"]);
});

test("distributes uneven totals with remainder on earlier points", () => {
  const pts = parseMarkingPoints("point one; point two", 3);
  assert.deepEqual(pts.map((p) => p.marks), [2, 1]);
});

test("empty scheme yields no points; formatter lists criteria", () => {
  assert.deepEqual(parseMarkingPoints("   ", 3), []);
  const out = formatMarkingCriteria(parseMarkingPoints("a; b", 2));
  assert.match(out, /1\. \[1 mark\] a/);
  assert.match(out, /2\. \[1 mark\] b/);
});
