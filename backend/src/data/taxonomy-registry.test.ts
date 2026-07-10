import assert from "node:assert/strict";
import test from "node:test";
import { TAXONOMY_REGISTRY, ALL_TAXONOMY_TOPICS, isValidSubtopicId, parentTopicId, getTopicName, hasTaxonomy } from "./taxonomy-registry";

test("every taxonomy is internally consistent", () => {
  for (const [code, tax] of Object.entries(TAXONOMY_REGISTRY)) {
    const ids = new Set<string>();
    const level1 = new Set(tax.topics.filter((t) => t.level === 1).map((t) => t.id));
    for (const topic of tax.topics) {
      assert.ok(!ids.has(topic.id), `${code}: duplicate id ${topic.id}`);
      ids.add(topic.id);
      if (topic.level === 1) {
        assert.equal(topic.parent_id, null, `${code}: level-1 ${topic.id} must have null parent`);
      } else {
        assert.equal(topic.level, 2, `${code}: ${topic.id} unexpected level`);
        assert.ok(topic.parent_id && level1.has(topic.parent_id), `${code}: ${topic.id} has orphan parent ${topic.parent_id}`);
        assert.ok(topic.keywords.length > 0, `${code}: subtopic ${topic.id} needs keywords`);
      }
    }
    assert.ok(tax.topics.some((t) => t.level === 2), `${code}: needs at least one subtopic`);
  }
});

test("global helpers resolve across subjects", () => {
  assert.equal(hasTaxonomy("4024"), true);
  assert.equal(hasTaxonomy("9999"), false);
  assert.equal(isValidSubtopicId("math.algebra.quadratics"), true);
  assert.equal(isValidSubtopicId("chem.acids.salts"), true);
  assert.equal(isValidSubtopicId("phys.motion.forces"), true);
  assert.equal(isValidSubtopicId("math.algebra"), false); // level-1 is not a classifiable subtopic
  assert.equal(isValidSubtopicId("not.a.real.id"), false);
  assert.equal(parentTopicId("chem.organic.alkenes"), "chem.organic");
  assert.equal(getTopicName("math.trig.right_angled"), "Pythagoras & Right-Angled Trigonometry");
});

test("subtopic ids are globally unique across subjects", () => {
  const seen = new Set<string>();
  for (const t of ALL_TAXONOMY_TOPICS) {
    assert.ok(!seen.has(t.id), `duplicate global id ${t.id}`);
    seen.add(t.id);
  }
});
