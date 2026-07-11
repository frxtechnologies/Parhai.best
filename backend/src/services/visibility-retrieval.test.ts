import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSourceForStudent } from "./visibility-retrieval";

test("sanitizeSourceForStudent leaves public sources untouched", () => {
  const src = { visibilityTier: "public", filePath: "papers/2024.pdf", reference: "Physics 5054 · 2024" };
  assert.deepEqual(sanitizeSourceForStudent(src), src);
});

test("sanitizeSourceForStudent leaves untagged (default-public) sources untouched", () => {
  const src = { filePath: "papers/2024.pdf", reference: "Physics 5054 · 2024" };
  assert.deepEqual(sanitizeSourceForStudent(src), src);
});

test("sanitizeSourceForStudent strips ALL identifying/download fields for private tiers", () => {
  const src = {
    visibilityTier: "ai_private",
    filePath: "private/teacher-guide.pdf",
    screenshotUrl: "https://storage/private/q7.png",
    sourceFile: "teacher-guide.pdf",
    reference: "Mrs Smith's Private Physics Guide, page 12",
  };
  const out = sanitizeSourceForStudent(src);
  assert.equal(out.filePath, null);
  assert.equal(out.screenshotUrl, null);
  assert.equal(out.sourceFile, null);
  assert.equal(out.reference, "Verified Parhai teaching material");
  // Never leaks the original filename/title anywhere in the sanitized output.
  assert.ok(!JSON.stringify(out).includes("teacher-guide"));
  assert.ok(!JSON.stringify(out).includes("Mrs Smith"));
});
