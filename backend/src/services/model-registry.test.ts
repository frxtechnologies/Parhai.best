import assert from "node:assert/strict";
import test from "node:test";
import { shouldPromote } from "./model-registry";

test("first model is always promoted", () => {
  assert.equal(shouldPromote({ accuracy: 0.4 }, null), true);
});

test("a better or equal candidate is promoted", () => {
  assert.equal(shouldPromote({ accuracy: 0.75 }, { accuracy: 0.70 }), true);
  assert.equal(shouldPromote({ accuracy: 0.70 }, { accuracy: 0.70 }), true); // retrain on more data, no regression
});

test("a regressing candidate is rejected", () => {
  assert.equal(shouldPromote({ accuracy: 0.68 }, { accuracy: 0.70 }), false);
});
