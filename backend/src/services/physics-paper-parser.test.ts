import assert from "node:assert/strict";
import test from "node:test";
import {
  detectPhysicsPaperMetadata,
  linkQuestionsToAnswers,
  parseMarkSchemeAnswers,
  parsePaperOneQuestions,
} from "./physics-paper-parser";

test("parses and links the Physics Paper 1 question structure", () => {
  const paperText = `5054/11/M/J/24\n1 A ray passes through a glass block. Which statement is correct?\nA option one\nB option two\n2 A circuit contains two lamps in parallel. What happens?\nA option one\nB option two`;
  const markSchemeText = `Question Answer\n1 B\n2 A`;

  const questions = parsePaperOneQuestions(paperText);
  const linked = linkQuestionsToAnswers(questions, parseMarkSchemeAnswers(markSchemeText));
  const metadata = detectPhysicsPaperMetadata(paperText, "5054_s24_qp_11.pdf");

  assert.equal(questions.length, 2);
  assert.equal(linked[0]?.answer, "B");
  assert.equal(linked[1]?.answer, "A");
  assert.equal(metadata.session, "MAY_JUNE");
  assert.equal(metadata.variant, 1);
});
