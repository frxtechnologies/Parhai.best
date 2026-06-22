export type AiProvider = "gemini" | "xai" | "openai" | "groq" | "openrouter";
export type QuestionClassification = {
  number: string;
  topic: string;
  subtopic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  summary: string;
};

const PROVIDERS: AiProvider[] = ["gemini", "xai", "openai", "groq", "openrouter"];
const provider = (process.env.AI_PROVIDER?.trim().toLowerCase() || "gemini") as AiProvider;

const providerConfig: Record<AiProvider, { key: string | undefined; keyName: string; baseUrl?: string; model: string }> = {
  gemini: { key: process.env.GEMINI_API_KEY, keyName: "GEMINI_API_KEY", model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite" },
  xai: { key: process.env.XAI_API_KEY, keyName: "XAI_API_KEY", baseUrl: "https://api.x.ai/v1", model: process.env.XAI_MODEL ?? "grok-3-mini" },
  openai: { key: process.env.OPENAI_API_KEY, keyName: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", model: process.env.OPENAI_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini" },
  groq: { key: process.env.GROQ_API_KEY, keyName: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile" },
  openrouter: { key: process.env.OPENROUTER_API_KEY, keyName: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini" },
};

export const AI_EMBEDDING_DIMENSIONS = 768;
export const AI_EMBEDDING_MODEL = provider === "gemini"
  ? process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001"
  : provider === "openai"
    ? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small"
    : `local-feature-hash-v1:${provider}`;

export function getAiProvider() {
  if (!PROVIDERS.includes(provider)) throw new Error(`Unsupported AI_PROVIDER '${provider}'. Use ${PROVIDERS.join(", ")}.`);
  return provider;
}

export function getAiConfigurationError() {
  if (!PROVIDERS.includes(provider)) return `Unsupported AI_PROVIDER '${provider}'.`;
  const config = providerConfig[provider];
  return config.key ? null : `AI assistant is not configured yet. Please add ${config.keyName} for AI_PROVIDER=${provider}.`;
}

export function isAiConfigured() {
  return getAiConfigurationError() === null;
}

export function getAiStatus() {
  const selected = getAiProvider();
  const config = providerConfig[selected];
  return { provider: selected, model: config.model, apiKeyDetected: Boolean(config.key), embeddingModel: AI_EMBEDDING_MODEL };
}

async function providerError(response: Response, body: { error?: { message?: string } | string; message?: string }, action: string) {
  const detail = typeof body.error === "string" ? body.error : body.error?.message ?? body.message;
  if (response.status === 401 || response.status === 403 || /api.?key|authenticat|unauthori|credential/i.test(detail ?? "")) return new Error(`${action} failed: invalid API key for ${provider}.`);
  if (response.status === 429) return new Error(`${action} failed: ${provider} rate limit reached. Please retry later.`);
  if (response.status === 404 || /model.*not found|unknown model|does not exist|not available/i.test(detail ?? "")) return new Error(`${action} failed: model '${providerConfig[provider].model}' is unavailable for ${provider}.`);
  if (response.status >= 500) return new Error(`${action} failed: ${provider} is temporarily unavailable.`);
  return new Error(detail ?? `${action} failed (${response.status}).`);
}

function requireConfig() {
  const error = getAiConfigurationError();
  if (error) throw new Error(error);
  return providerConfig[getAiProvider()] as typeof providerConfig[AiProvider] & { key: string };
}

async function geminiChat(systemInstruction: string, prompt: string, jsonMode = false) {
  const config = requireConfig();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096, ...(jsonMode ? { responseMimeType: "application/json" } : {}) },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json() as { error?: { message?: string }; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  if (!response.ok) throw await providerError(response, body, "AI request");
  const answer = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!answer) throw new Error("The AI provider returned an empty response.");
  return answer;
}

async function compatibleChat(systemInstruction: string, prompt: string, jsonMode = false) {
  const config = requireConfig();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://parhais.netlify.app", "X-Title": "Parhai.com" } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "system", content: systemInstruction }, { role: "user", content: prompt }],
      temperature: 0.1,
      ...(jsonMode && ["openai", "groq"].includes(provider) ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!response.ok) throw await providerError(response, body, "AI request");
  const answer = body.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("The AI provider returned an empty response.");
  return answer;
}

export async function generateAiAnswer(systemInstruction: string, prompt: string) {
  return getAiProvider() === "gemini" ? geminiChat(systemInstruction, prompt) : compatibleChat(systemInstruction, prompt);
}

function localFeatureEmbedding(text: string) {
  const vector = Array<number>(AI_EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) hash = Math.imul(hash ^ token.charCodeAt(index), 16777619);
    vector[(hash >>> 0) % AI_EMBEDDING_DIMENSIONS]! += 1;
  }
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / length);
}

async function geminiEmbeddings(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  const config = requireConfig();
  const modelName = `models/${AI_EMBEDDING_MODEL}`;
  const output: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += 20) {
    const batch = texts.slice(offset, offset + 20);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(AI_EMBEDDING_MODEL)}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.key },
      body: JSON.stringify({ requests: batch.map((text) => ({ model: modelName, content: { parts: [{ text }] }, taskType, outputDimensionality: AI_EMBEDDING_DIMENSIONS })) }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await response.json() as { error?: { message?: string }; embeddings?: Array<{ values?: number[] }> };
    if (!response.ok) throw await providerError(response, body, "AI embedding");
    output.push(...(body.embeddings?.map((item) => item.values ?? []) ?? []));
  }
  return output;
}

async function openAiEmbeddings(texts: string[]) {
  const config = requireConfig();
  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: AI_EMBEDDING_MODEL, input: texts, encoding_format: "float", dimensions: AI_EMBEDDING_DIMENSIONS }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json() as { error?: { message?: string }; data?: Array<{ index: number; embedding: number[] }> };
  if (!response.ok) throw await providerError(response, body, "AI embedding");
  return (body.data ?? []).sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

async function createEmbeddings(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  if (!texts.length) return [];
  requireConfig();
  const selected = getAiProvider();
  const embeddings = selected === "gemini" ? await geminiEmbeddings(texts, taskType)
    : selected === "openai" ? await openAiEmbeddings(texts)
      : texts.map(localFeatureEmbedding);
  if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length !== AI_EMBEDDING_DIMENSIONS)) throw new Error("The AI service returned invalid embeddings.");
  return embeddings;
}

export function generateDocumentEmbeddings(texts: string[]) {
  return createEmbeddings(texts, "RETRIEVAL_DOCUMENT");
}

export async function generateQueryEmbedding(text: string) {
  return (await createEmbeddings([text], "RETRIEVAL_QUERY"))[0]!;
}

export async function classifyQuestions(subject: string, questions: Array<{ number: string; text: string }>) {
  const classified = new Map<string, QuestionClassification>();
  for (let offset = 0; offset < questions.length; offset += 10) {
    const batch = questions.slice(offset, offset + 10).map((question) => ({ ...question, text: question.text.slice(0, 1600) }));
    const instruction = "You classify real exam questions. Return JSON only with an items array. Never invent questions.";
    const prompt = `Classify these ${subject} questions. Every item needs number, topic, subtopic, difficulty (EASY, MEDIUM, HARD), and a one-sentence summary.\n${JSON.stringify(batch)}`;
    const raw = getAiProvider() === "gemini" ? await geminiChat(instruction, prompt, true) : await compatibleChat(instruction, prompt, true);
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as QuestionClassification[] | { items?: QuestionClassification[] };
    const rows = Array.isArray(parsed) ? parsed : parsed.items ?? [];
    for (const row of rows) {
      if (!batch.some((question) => question.number === String(row.number))) continue;
      classified.set(String(row.number), { ...row, number: String(row.number), difficulty: ["EASY", "MEDIUM", "HARD"].includes(row.difficulty) ? row.difficulty : "MEDIUM" });
    }
  }
  return classified;
}
