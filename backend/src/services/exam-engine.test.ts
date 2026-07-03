import assert from "node:assert/strict";
import test from "node:test";
import { aggregateTopics,detectExamIntent,detectSubjectCode,inferDifficulty } from "./exam-engine";

test("separates paper lookup, question search, analysis, and trends",()=>{
  assert.equal(detectExamIntent("Give me 2023 Maths Paper 1"),"paper_lookup");
  assert.equal(detectExamIntent("Give me Light questions"),"question_search");
  assert.equal(detectExamIntent("Analyze Physics 2023 Paper 1"),"paper_analysis");
  assert.equal(detectExamIntent("Is Electricity increasing in recent papers?"),"topic_trend");
  assert.equal(detectExamIntent("How many Light questions are in this paper?"),"topic_count");
  assert.equal(detectExamIntent("Show repeated Electricity questions"),"repeated_questions");
  assert.equal(detectExamIntent("Show only Light questions with official marking schemes linked"),"question_search");
});

test("maps explicit Cambridge subject aliases deterministically",()=>{
  assert.equal(detectSubjectCode("Give me 2023 Maths Paper 1"),"4024");
  assert.equal(detectSubjectCode("Open Mathematics Syllabus D"),"4024");
  assert.equal(detectSubjectCode("Give me 2023 Physics Paper 1"),"5054");
  assert.equal(detectSubjectCode("Show phy 5054 Paper 2"),"5054");
});

test("aggregates deterministic topic, marks, subtopic, and difficulty counts",()=>{
  const result=aggregateTopics([
    {id:1,topic:"Light",subtopic:"Refraction",difficulty:"MEDIUM",marks:2},
    {id:2,topic:"Light",subtopic:"Lenses",difficulty:"HARD",total_marks:4},
    {id:3,topic:"Electricity",difficulty:"EASY",marks:1},
  ]);
  assert.deepEqual(result.topics[0],{topic:"Light",questions:2,marks:6,subtopics:{Refraction:1,Lenses:1},difficulty:{MEDIUM:1,HARD:1},questionIds:[1,2]});
});

test("difficulty uses marks, parts, and demanding command words",()=>{
  assert.equal(inferDifficulty({marks:1,text:"State the unit"}).difficulty,"EASY");
  assert.equal(inferDifficulty({marks:5,questionNumber:"4(b)(ii)",text:"Explain and calculate the result"}).difficulty,"HARD");
});
