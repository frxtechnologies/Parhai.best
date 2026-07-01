import assert from "node:assert/strict";
import test from "node:test";
import { filenameHints, mismatchMessage } from "./paper-checker-filename";

const paper = {
  id: 1,
  year: 2022,
  session: "MAY_JUNE",
  paper_number: 2,
  paper_code: "2",
  variant: 2,
  original_filename: "4024_s22_qp_22.pdf",
  question_paper_code: "4024_s22_qp_22",
  indexed_question_count: 37,
  verified_question_count: 6,
  marking_scheme_linked_count: 3,
  indexed_question_number_count: 22,
  verified_question_number_count: 6,
  marking_scheme_linked_question_count: 3,
  expected_question_count: 22,
  subjects: { name: "Mathematics (Syllabus D)", code: "4024" },
};

test("detects paper and year hints from a solved-paper filename", () => {
  assert.deepEqual(filenameHints("Maths P1 23 Solved.pdf"), {
    year: 2023,
    paper: 1,
    variant: null,
  });
});

test("warns when solved-paper filename hints conflict with selection", () => {
  const hints = filenameHints("Maths P1 23 Solved.pdf");
  assert.match(mismatchMessage(paper, "Maths P1 23 Solved.pdf", hints), /Paper 1 instead of Paper 2/);
  assert.match(mismatchMessage(paper, "Maths P1 23 Solved.pdf", hints), /2023 instead of 2022/);
});
