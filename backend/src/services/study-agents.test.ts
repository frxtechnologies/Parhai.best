import assert from "node:assert/strict";
import test from "node:test";
import { classifyQuestionType } from "./study-agents";

test("classifies question types deterministically",()=>{
  assert.equal(classifyQuestionType("Calculate the resistance of the circuit."),"calculation-based");
  assert.equal(classifyQuestionType("Plot the graph and find its gradient."),"graph-based");
  assert.equal(classifyQuestionType("Draw and label the ray diagram."),"diagram-based");
  assert.equal(classifyQuestionType("Explain why the temperature increases."),"explanation-based");
  assert.equal(classifyQuestionType("State the name of the force."),"theory-based");
});
