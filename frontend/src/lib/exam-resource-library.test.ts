import assert from "node:assert/strict";
import test from "node:test";
import { groupExamResources, normalizeExamResource, pairStatus, type ExamLibraryResource } from "./exam-resource-library";

const resource = (id: number, type: string, year: number, session: string, paper: number, variant: number): ExamLibraryResource => ({
  id, title: `5054_w22_${type === "PAST_PAPER" ? "qp" : "ms"}_${paper}${variant}`, original_filename: `5054_w22_${type === "PAST_PAPER" ? "qp" : "ms"}_${paper}${variant}.pdf`,
  resource_type: type, subject_id: 1, year, session, paper_code: String(paper), paper_number: paper, variant,
  status: "processed", processing_status: "processed", subjects: { name: "Physics", code: "5054" },
});

test("normalizes readable exam titles and sorting metadata", () => {
  const normalized = normalizeExamResource(resource(1, "PAST_PAPER", 2022, "OCT_NOV", 1, 1));
  assert.equal(normalized.displayTitle, "Paper 1 · Variant 1");
  assert.equal(normalized.sessionLabel, "Oct/Nov");
});

test("groups and pairs papers with schemes while detecting missing pairs", () => {
  const groups = groupExamResources([resource(1, "PAST_PAPER", 2024, "MAY_JUNE", 1, 1), resource(2, "MARKING_SCHEME", 2024, "MAY_JUNE", 1, 1), resource(3, "PAST_PAPER", 2023, "OCT_NOV", 2, 1)]);
  assert.equal(groups[0]!.yearGroups[0]!.year, 2024);
  assert.equal(groups[0]!.yearGroups[0]!.sessions[0]!.papers.length, 1);
  assert.equal(pairStatus(groups[0]!.yearGroups[0]!.sessions[0]!.papers[0]!), "Processed");
  assert.equal(pairStatus(groups[0]!.yearGroups[1]!.sessions[0]!.papers[0]!), "Missing Marking Scheme");
});
