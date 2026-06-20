const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

export const GEMINI_NOT_CONFIGURED = "AI assistant is not configured yet. Please add GEMINI_API_KEY.";

export function isGeminiConfigured() {
  return Boolean(apiKey);
}

export async function generateGroundedAnswer(systemInstruction: string, prompt: string) {
  if (!apiKey) throw new Error(GEMINI_NOT_CONFIGURED);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  const body = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) throw new Error(body.error?.message ?? `Gemini request failed (${response.status}).`);

  const answer = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!answer) throw new Error("Gemini returned an empty response.");
  return answer;
}

export type QuestionClassification = {
  number: string;
  topic: string;
  subtopic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  summary: string;
};

export async function classifyExamQuestions(
  subject: string,
  questions: Array<{ number: string; text: string }>
) {
  if (!apiKey) return new Map<string, QuestionClassification>();
  const classified = new Map<string, QuestionClassification>();

  for (let offset = 0; offset < questions.length; offset += 10) {
    const batch = questions.slice(offset, offset + 10).map((question) => ({ ...question, text: question.text.slice(0, 1200) }));
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `Classify these real ${subject} exam questions. Return a JSON array only. Each item must contain number, topic, subtopic, difficulty (EASY, MEDIUM, or HARD), and a one-sentence summary. Do not rewrite or invent questions.\n\n${JSON.stringify(batch)}` }] }],
          generationConfig: {
            temperature: 0,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: "application/json",
            maxOutputTokens: 4096,
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                required: ["number", "topic", "subtopic", "difficulty", "summary"],
                properties: {
                  number: { type: "STRING" }, topic: { type: "STRING" }, subtopic: { type: "STRING" },
                  difficulty: { type: "STRING", enum: ["EASY", "MEDIUM", "HARD"] }, summary: { type: "STRING" },
                },
              },
            },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const body = (await response.json()) as { error?: { message?: string }; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    if (!response.ok) throw new Error(body.error?.message ?? `Gemini classification failed (${response.status}).`);
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "[]";
    const rows = JSON.parse(text) as QuestionClassification[];
    for (const row of rows) {
      if (!batch.some((question) => question.number === String(row.number))) continue;
      const difficulty = ["EASY", "MEDIUM", "HARD"].includes(row.difficulty) ? row.difficulty : "MEDIUM";
      classified.set(String(row.number), { ...row, number: String(row.number), difficulty });
    }
  }
  return classified;
}
