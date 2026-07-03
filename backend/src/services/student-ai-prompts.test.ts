import assert from "node:assert/strict";
import test from "node:test";
import { buildGroundedStudentSystemPrompt, detectStudentIntent } from "./student-ai-prompts";

test("maps common student requests to deterministic tools", () => {
  assert.equal(detectStudentIntent("Find Light past paper questions"), "search_questions");
  assert.equal(detectStudentIntent("Make a 14 day revision plan"), "create_revision_plan");
  assert.equal(detectStudentIntent("Why did I lose marks? Mark my answer"), "mark_answer");
});

test("grounded prompt forbids invented official data", () => {
  const prompt = buildGroundedStudentSystemPrompt("get_marking_scheme");
  assert.match(prompt, /Never invent/);
  assert.match(prompt, /marking-scheme data is missing/);
});

