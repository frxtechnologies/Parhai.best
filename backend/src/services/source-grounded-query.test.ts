import assert from"node:assert/strict";
import test from"node:test";
import{classifyQuestionTypeDetailed,parseStudentPromptToQuery,validateSourceAgainstParsedQuery}from"./source-grounded-query";

test("parses strict Physics calculation filters",()=>{
  assert.deepEqual(parseStudentPromptToQuery("Find calculation-based questions from O Level Physics 5054 Paper 2 from 2020 to 2024. Show marks, topic, difficulty, and source."),{
    intent:"find_questions",level:"O_LEVEL",subject:"Physics",syllabusCode:"5054",yearStart:2020,yearEnd:2024,session:null,paperNumber:2,variant:null,componentVariantCode:null,topic:null,subtopic:null,questionType:"calculation",markingSchemeRequired:false,sourceRequired:true,verifiedOnly:true,
  });
});

test("rejects wrong paper and wrong question type",()=>{
  const query=parseStudentPromptToQuery("Find calculation questions from O Level Physics 5054 Paper 2 from 2020 to 2024");
  const result=validateSourceAgainstParsedQuery({subject_code:"5054",level:"O_LEVEL",year:2022,paper_code:"4",question_type:"theory",student_verified:true},query);
  assert.equal(result.valid,false);assert.equal(result.reasons.length,2);
});

test("accepts mixed questions containing calculation",()=>{
  const query=parseStudentPromptToQuery("Find calculation questions from O Level Physics 5054 Paper 2 from 2020 to 2024");
  assert.equal(validateSourceAgainstParsedQuery({subject_code:"5054",level:"O_LEVEL",year:2022,paper_code:"2",question_type:"mixed",question_type_metadata:{subtypes:["calculation","graph"]},student_verified:true},query).valid,true);
});

test("classifies multi-signal questions as mixed",()=>{
  assert.deepEqual(classifyQuestionTypeDetailed("Plot a graph and calculate its gradient.").questionType,"mixed");
});

test("evaluation prompts preserve strict Cambridge filters",()=>{
  const light=parseStudentPromptToQuery("Find Light questions from O Level Physics 5054 from 2020 to 2024.");
  assert.equal(light.topic,"Light");assert.equal(light.syllabusCode,"5054");
  const maths=parseStudentPromptToQuery("Find O Level Mathematics 4024 Paper 1 May/June 2023 questions.");
  assert.equal(maths.paperNumber,1);assert.equal(maths.session,"MAY_JUNE");assert.equal(maths.yearStart,2023);
  const aLevel=parseStudentPromptToQuery("Find A Level Physics 9702 Paper 4 questions from 2020 to 2024.");
  assert.equal(aLevel.syllabusCode,"9702");assert.equal(aLevel.level,"A_LEVEL");assert.equal(aLevel.paperNumber,4);
});

test("official marking scheme requirement rejects partial and generic sources",()=>{
  const query=parseStudentPromptToQuery("Show only Light questions with official marking schemes linked.");
  assert.equal(query.markingSchemeRequired,true);
  assert.equal(validateSourceAgainstParsedQuery({topic:"Light",marking_scheme_link_status:"partial",student_verified:true},query).valid,false);
  assert.equal(validateSourceAgainstParsedQuery({topic:"Light",marking_scheme_link_status:"linked_exact",student_verified:true},query).valid,true);
});
