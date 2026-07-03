import test from "node:test";
import assert from "node:assert/strict";
import { chunkTypeForResource, cleanMarkingSchemeText, extractMarkingSchemeAnswers } from "./resource-processor";

test("extracts Cambridge question parts without treating 12 as variant 12", () => {
  const rows = extractMarkingSchemeAnswers("1 (a) refraction towards normal [1]\n(b) total internal reflection [2]\n2 answer 4.5 J [2]");
  assert.deepEqual(rows.map((row) => [row.baseNumber, row.questionPart]), [["1", "(a)"], ["1", "(b)"], ["2", null]]);
});

test("assigns typed searchable chunks by resource behavior",()=>{
  assert.equal(chunkTypeForResource("MARKING_SCHEME"),"marking_scheme_answer");
  assert.equal(chunkTypeForResource("NOTES"),"note_section");
  assert.equal(chunkTypeForResource("SYLLABUS"),"syllabus_section");
  assert.equal(chunkTypeForResource("EXAMINER_REPORT"),"examiner_insight");
  assert.equal(chunkTypeForResource("GRADE_THRESHOLD"),"grade_threshold");
});

test("extracts both columns from Cambridge multiple-choice keys",()=>{
  const answers=extractMarkingSchemeAnswers("Question Number Key Question Number Key\n1 D 21 C\n2 A 22 B\n18 A 38 B\n20 D 40 C");
  assert.equal(answers.find(row=>row.baseNumber==="23"),undefined);
  // The compact fixture has eight answers; production MCQ detection activates
  // once a real table contains at least ten entries.
  const full=extractMarkingSchemeAnswers(Array.from({length:20},(_,i)=>`${i+1} A ${i+21} B`).join("\n"));
  assert.equal(full.length,40);
  assert.equal(full.find(row=>row.baseNumber==="38")?.cleanText,"B");
});

test("cleans marking scheme boilerplate", () => {
  assert.equal(cleanMarkingSchemeText("UCLES Page 2 of 8 MARK SCHEME\nallow 9.8 N"), "allow 9.8 N");
});

test("ignores numbered marking principles before the answer table", () => {
  const rows = extractMarkingSchemeAnswers(`Mathematics Specific Marking Principles
1 Unless a method is specified, use any correct method.
2 Answers may be fractions.
Question Answer Marks Partial Marks
1(a) 1.52 1
1(b) 1.44 oe 1
2 Tangent and sector 2`);
  assert.deepEqual(rows.map((row) => [row.baseNumber, row.questionPart]), [["1", "(a)"], ["1", "(b)"], ["2", null]]);
  assert.doesNotMatch(rows[0]!.cleanText, /method is specified/i);
});
