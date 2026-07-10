import assert from "node:assert/strict";
import test from "node:test";
import { looksScanned } from "./ocr-fallback";

test("looksScanned flags empty and scanned text layers", () => {
  assert.equal(looksScanned("", 5), true);
  assert.equal(looksScanned("   \n\t  ", 3), true);
  assert.equal(looksScanned("a".repeat(50), 1), true);       // < 100 chars/page
  assert.equal(looksScanned("a".repeat(400), 10), true);     // 40 chars/page avg
});

test("looksScanned passes a real text layer", () => {
  assert.equal(looksScanned("a".repeat(2000), 1), false);
  assert.equal(looksScanned("word ".repeat(500), 2), false); // ~2500 chars over 2 pages
});
