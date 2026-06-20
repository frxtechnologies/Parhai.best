export type PaperSession = "MAY_JUNE" | "OCT_NOV" | "FEB_MAR";

export interface ParsedQuestion {
  number: string;
  text: string;
  marks: number;
  answer: string | null;
}

export interface DetectedPaperMetadata {
  subjectCode: "5054";
  year: 2024;
  session: PaperSession | null;
  paperNumber: 1;
  variant: number | null;
}

export function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectPhysicsPaperMetadata(text: string, filename: string): DetectedPaperMetadata {
  const source = `${filename}\n${text.slice(0, 6000)}`;
  const component = source.match(/5054\s*\/\s*(1\d)/i)?.[1] ?? source.match(/5054[_-](?:[a-z]\d{2}[_-])?(?:qp|ms)[_-](1\d)/i)?.[1];
  const sessionToken = source.match(/\b(M\s*\/\s*J|O\s*\/\s*N|F\s*\/\s*M)\b/i)?.[1]?.replace(/\s/g, "").toUpperCase();
  const session = sessionToken === "M/J" ? "MAY_JUNE" : sessionToken === "O/N" ? "OCT_NOV" : sessionToken === "F/M" ? "FEB_MAR" : null;

  return {
    subjectCode: "5054",
    year: 2024,
    session,
    paperNumber: 1,
    variant: component ? Number(component[1]) : null,
  };
}

export function parsePaperOneQuestions(text: string): ParsedQuestion[] {
  const lines = normalizePdfText(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: Array<{ number: number; lines: string[] }> = [];
  let expected = 1;
  let current: { number: number; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^(\d{1,2})(?:[.)]|\s+)\s*(.*)$/);
    const number = match ? Number(match[1]) : NaN;

    if (number === expected && number <= 40) {
      if (current) sections.push(current);
      current = { number, lines: match?.[2] ? [match[2]] : [] };
      expected += 1;
      continue;
    }

    if (current) current.lines.push(line);
    if (expected > 40 && current) break;
  }

  if (current) sections.push(current);

  return sections
    .filter((section) => section.lines.join(" ").length >= 12)
    .map((section) => ({
      number: String(section.number),
      text: section.lines.join(" ").replace(/\s+/g, " ").trim(),
      marks: 1,
      answer: null,
    }));
}

export function parseMarkSchemeAnswers(text: string): Map<string, string> {
  const normalized = normalizePdfText(text);
  const answers = new Map<string, string>();
  const pair = /(?:^|\s)([1-9]|[1-3]\d|40)\s*[:.)-]?\s*([A-D])(?=\s|$)/gim;

  for (const match of normalized.matchAll(pair)) {
    const number = String(Number(match[1]));
    if (!answers.has(number)) answers.set(number, match[2].toUpperCase());
  }

  return answers;
}

export function linkQuestionsToAnswers(questions: ParsedQuestion[], answers: Map<string, string>) {
  return questions.map((question) => ({ ...question, answer: answers.get(question.number) ?? null }));
}
