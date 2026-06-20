const apiKey = process.env.OPENAI_API_KEY;
const chatModel = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function openAiRequest<T>(path: string, body: unknown): Promise<T> {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the API server.");

  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

export function isOpenAiConfigured() {
  return Boolean(apiKey);
}

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const result = await openAiRequest<{ data: Array<{ index: number; embedding: number[] }> }>("embeddings", {
    model: embeddingModel,
    input: inputs,
    encoding_format: "float",
  });

  return result.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

export async function createChatCompletion(messages: ChatMessage[]): Promise<string> {
  const result = await openAiRequest<{ choices: Array<{ message: { content: string | null } }> }>("chat/completions", {
    model: chatModel,
    messages,
    temperature: 0.1,
  });
  const content = result.choices[0]?.message.content?.trim();
  if (!content) throw new Error("The AI provider returned an empty answer.");
  return content;
}

export async function detectPhysicsTopics(
  questions: Array<{ number: string; text: string }>
): Promise<Map<string, Array<{ name: string; confidence: number }>>> {
  if (!apiKey || questions.length === 0) return new Map();

  const allowedTopics = [
    "Measurements",
    "Motion",
    "Forces",
    "Energy",
    "Thermal Physics",
    "Waves",
    "Light",
    "Sound",
    "Electricity",
    "Magnetism",
    "Electromagnetic Induction",
    "Atomic Physics",
    "Radioactivity",
  ];
  const output = new Map<string, Array<{ name: string; confidence: number }>>();

  for (let index = 0; index < questions.length; index += 10) {
    const batch = questions.slice(index, index + 10);
    try {
      const response = await createChatCompletion([
        {
          role: "system",
          content:
            "Classify each Cambridge O-Level Physics 5054 multiple-choice question using one or two allowed topics. " +
            `Allowed topics: ${allowedTopics.join(", ")}. Return only JSON as an array of ` +
            '{"number":"1","topics":[{"name":"Forces","confidence":0.95}]}.',
        },
        { role: "user", content: JSON.stringify(batch) },
      ]);

      const json = response.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(json) as Array<{
        number: string;
        topics: Array<{ name: string; confidence: number }>;
      }>;
      for (const item of parsed) {
        const topics = item.topics.filter((topic) => allowedTopics.includes(topic.name)).slice(0, 2);
        output.set(String(item.number), topics);
      }
    } catch {
      // A malformed classifier response must not discard an otherwise valid paper ingestion.
    }
  }

  return output;
}
