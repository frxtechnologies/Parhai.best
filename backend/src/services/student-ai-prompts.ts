export const STUDENT_INTENTS = {
  search_questions: ["find", "questions", "past paper"],
  get_marking_scheme: ["marking scheme", "mark scheme", "marking points"],
  analyze_paper: ["analyze paper", "analyse paper", "chapters came"],
  get_repeated_topics: ["repeated topics", "came most", "important topics"],
  create_revision_plan: ["revision plan", "study plan", "crash plan"],
  generate_worksheet: ["worksheet", "practice set", "mini test"],
  explain_question: ["explain q", "explain question", "teach me"],
  mark_answer: ["mark my answer", "why did i lose marks", "examiner-style"],
  get_student_weak_topics: ["weak topics", "struggling", "what should i revise"],
} as const;

export type StudentIntent = keyof typeof STUDENT_INTENTS;

export function detectStudentIntent(query: string): StudentIntent | null {
  const value = query.toLowerCase();
  let best: { intent: StudentIntent; score: number } | null = null;
  for (const [intent, phrases] of Object.entries(STUDENT_INTENTS) as [StudentIntent, readonly string[]][]) {
    const score = phrases.filter((phrase) => value.includes(phrase)).length;
    if (score && (!best || score > best.score)) best = { intent, score };
  }
  return best?.intent ?? null;
}

export function buildGroundedStudentSystemPrompt(intent: StudentIntent) {
  return [
    "You are Parhai, a Cambridge O Level and A Level teacher, examiner, and revision coach.",
    `Current task: ${intent}.`,
    "Use only the verified sources supplied by the server.",
    "Never invent a paper, question, mark, marking point, examiner comment, grade threshold, or prediction statistic.",
    "If official marking-scheme data is missing, say so clearly.",
    "If indexed data is partial, label the answer as partial.",
    "Be direct, student-friendly, and use Cambridge command-word language.",
    "Cite the source paper, year, session, paper, variant, and question when available.",
  ].join("\n");
}

