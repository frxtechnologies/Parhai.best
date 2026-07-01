import test from "node:test";
import assert from "node:assert/strict";
import { markTypedAnswer } from "./paper-checker";

test("does not invent official marks without a scheme", () => {
  assert.equal(markTypedAnswer({studentAnswer:"42",officialAnswer:null,maxMarks:2}).awardedMarks,null);
});

test("awards no more than available marks", () => {
  const result=markTypedAnswer({studentAnswer:"speed increases acceleration is constant",officialAnswer:"speed increases; acceleration is constant",maxMarks:2});
  assert.equal(result.awardedMarks,2);
});

test("blank answers receive zero when a scheme exists", () => {
  assert.equal(markTypedAnswer({studentAnswer:"",officialAnswer:"refraction towards normal",maxMarks:1}).awardedMarks,0);
});
