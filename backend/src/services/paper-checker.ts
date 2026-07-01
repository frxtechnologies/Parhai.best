export const MISTAKE_TYPES = [
  "concept error", "calculation error", "missing unit", "missing working",
  "incomplete explanation", "wrong formula", "graph/diagram error",
  "careless mistake", "not enough detail", "wrong command word",
] as const;

function meaningfulTokens(value: string) {
  const ignored = new Set(["the","and","for","with","that","this","from","into","then","than","are","was","were","has","have","will","can","must"]);
  return new Set((value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 2 && !ignored.has(token)));
}

export function splitOfficialPoints(answer: string) {
  const points = answer.split(/\s*(?:\n|;|•)\s*/).map((point) => point.trim()).filter(Boolean);
  return points.length ? points : [answer.trim()].filter(Boolean);
}

export function markTypedAnswer(input: { studentAnswer: string; officialAnswer: string | null; maxMarks: number }) {
  const student = input.studentAnswer.trim();
  if (!input.officialAnswer?.trim()) return {
    awardedMarks: null, correctPoints: [], missingPoints: [], mistakeType: null,
    feedback: "Marking scheme is not linked for this question, so official marking is unavailable.",
    examinerTip: "Ask your teacher to review this answer or try again after the marking scheme is linked.",
    confidence: 0, markingStatus: "unavailable" as const,
  };
  const points = splitOfficialPoints(input.officialAnswer);
  if (!student) return {
    awardedMarks: 0, correctPoints: [], missingPoints: points, mistakeType: "incomplete explanation",
    feedback: "No answer was provided.", examinerTip: "Attempt every part and show your working.",
    confidence: 1, markingStatus: "official_scheme" as const,
  };
  const studentTokens = meaningfulTokens(student);
  const scored = points.map((point) => {
    const expected = [...meaningfulTokens(point)];
    const overlap = expected.filter((token) => studentTokens.has(token)).length;
    return { point, matched: expected.length > 0 && overlap / expected.length >= 0.5 };
  });
  const correctPoints = scored.filter((row) => row.matched).map((row) => row.point);
  const missingPoints = scored.filter((row) => !row.matched).map((row) => row.point);
  const ratio = points.length ? correctPoints.length / points.length : 0;
  const awardedMarks = Math.min(input.maxMarks, Math.floor(ratio * input.maxMarks + 1e-9));
  const lower = student.toLowerCase();
  const mistakeType = missingPoints.length === 0 ? null
    : /\b\d+(?:\.\d+)?\s*$/.test(student) && !/\b(n|j|w|v|a|m\/s|kg|pa|hz|ohm|°c)\b/i.test(lower) ? "missing unit"
      : /calculate|formula|equation/i.test(input.officialAnswer) ? "calculation error" : "not enough detail";
  return {
    awardedMarks, correctPoints, missingPoints, mistakeType,
    feedback: missingPoints.length ? `You included ${correctPoints.length} of ${points.length} identified marking points.` : "Your answer includes the identified marking points.",
    examinerTip: missingPoints.length ? "Use the question's command word and include each distinct marking point." : "Keep this level of precision in the exam.",
    confidence: points.length > 1 ? 0.78 : 0.72,
    markingStatus: "official_scheme" as const,
  };
}
