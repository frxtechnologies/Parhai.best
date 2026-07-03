import assert from "node:assert/strict";
import test from "node:test";
import { detectResourceMetadata } from "./metadata-detector";

test("detects canonical Cambridge filenames exactly",()=>{
  const result=detectResourceMetadata("4024_s23_qp_12.pdf");
  assert.deepEqual(result.metadata,{syllabusCode:"4024",year:2023,session:"MAY_JUNE",paperNumber:1,variant:2,resourceType:"PAST_PAPER",subjectName:"Mathematics (Syllabus D)",level:"O_LEVEL"});
  assert.equal(result.status,"Ready");
});
test("detects Pakistan-focused Cambridge O and AS/A Level codes",()=>{
  const o=detectResourceMetadata("2210_s23_qp_12.pdf");
  const a=detectResourceMetadata("9702_w22_qp_42.pdf");
  assert.equal(o.metadata.level,"O_LEVEL");assert.equal(o.metadata.subjectName,"Computer Science");
  assert.equal(a.metadata.level,"A_LEVEL");assert.equal(a.metadata.paperNumber,4);assert.equal(a.metadata.variant,2);
});
test("uses friendly filename and PDF header signals",()=>{
  const result=detectResourceMetadata("Physics O Level 2022 Oct Nov Paper 2 Mark Scheme.pdf","Cambridge O Level 5054/22 October/November 2022 MARK SCHEME");
  assert.equal(result.metadata.syllabusCode,"5054"); assert.equal(result.metadata.variant,2); assert.equal(result.metadata.resourceType,"MARKING_SCHEME");
});
test("does not guess a missing variant",()=>{
  const result=detectResourceMetadata("Maths P1 2023 Solved.pdf");
  assert.equal(result.metadata.variant,null); assert.equal(result.status,"Needs Review");
});
test("flags filename and PDF conflicts",()=>{
  const result=detectResourceMetadata("4024_s23_qp_12.pdf","Cambridge 4024/22 October/November 2022 MARK SCHEME");
  assert.equal(result.status,"Conflict"); assert.ok(result.conflicts.length>=3);
});
