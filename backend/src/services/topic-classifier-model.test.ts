import assert from "node:assert/strict";
import test from "node:test";
import { TopicClassifierModel, tokenize } from "./topic-classifier-model";

const train = [
  { text: "calculate the resultant force and acceleration using Newton's second law", topicId: "phys.motion.forces" },
  { text: "a body accelerates under a resultant force, find the acceleration", topicId: "phys.motion.forces" },
  { text: "electric current through a resistor and the potential difference", topicId: "phys.electricity.circuits" },
  { text: "series and parallel resistors, total resistance in the circuit", topicId: "phys.electricity.circuits" },
  { text: "the atom contains protons neutrons and electrons, nucleon number", topicId: "phys.atomic.nuclear_atom" },
];

test("Naive Bayes predicts the right topic on separable data", () => {
  const model = new TopicClassifierModel();
  model.train(train);
  assert.equal(model.predict("find the acceleration from the resultant force").topicId, "phys.motion.forces");
  assert.equal(model.predict("resistance of resistors in a circuit").topicId, "phys.electricity.circuits");
  const p = model.predict("protons and neutrons in the nucleus");
  assert.equal(p.topicId, "phys.atomic.nuclear_atom");
  assert.ok(p.confidence > 0 && p.confidence <= 1);
});

test("prediction is masked to the allowed (subject) classes", () => {
  const model = new TopicClassifierModel();
  model.train(train);
  // Force it to choose only among electricity/atomic even for a forces query.
  const masked = model.predict("resultant force and acceleration", ["phys.electricity.circuits", "phys.atomic.nuclear_atom"]);
  assert.ok(masked.topicId === "phys.electricity.circuits" || masked.topicId === "phys.atomic.nuclear_atom");
});

test("serialize/deserialize round-trips predictions", () => {
  const model = new TopicClassifierModel();
  model.train(train);
  const restored = TopicClassifierModel.fromJSON(JSON.parse(JSON.stringify(model.toJSON())));
  assert.equal(restored.predict("current through a resistor").topicId, model.predict("current through a resistor").topicId);
});

test("tokenizer drops stopwords and short tokens", () => {
  assert.deepEqual(tokenize("Calculate the FORCE on a body"), ["force", "body"]);
});
