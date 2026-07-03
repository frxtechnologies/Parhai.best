import assert from"node:assert/strict";import test from"node:test";
import{buildCambridgeIdentity,compareCambridgeIdentity,validateQuestionMarkSchemePair}from"./cambridge-identity";

const question={subject_code:"5054",level:"O_LEVEL",year:2023,session:"MAY_JUNE",paper_code:"2",variant:1,question_number:"6(b)(i)"};
const answer={syllabus_code:"5054",level:"O_LEVEL",year:2023,session:"MAY_JUNE",paper_number:2,variant:1,question_number:"6",question_part:"(b)(i)",answer_type:"question_answer",is_question_specific:true,extraction_confidence:.95,link_confidence:.95};
test("builds the same normalized identity for question and answer rows",()=>assert.equal(compareCambridgeIdentity(buildCambridgeIdentity(question),buildCambridgeIdentity(answer)).match,true));
test("rejects wrong question and wrong variant",()=>{
  const result=validateQuestionMarkSchemePair(question,{...answer,variant:2,question_number:"5"});
  assert.equal(result.valid,false);assert.deepEqual(result.mismatchFields,["variant","componentVariantCode","questionNumber"]);
});
test("rejects generic guidance even when metadata matches",()=>assert.equal(validateQuestionMarkSchemePair(question,{...answer,answer_type:"generic_guidance",is_question_specific:false}).valid,false));
