import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyQuestions } from "../lib/ai-service";
import { canonicalTopic } from "./rag-utils";

type TopicMapRow = {
  topic: string;
  subtopic: string;
  syllabus_reference: string | null;
  keywords: string[];
};

export type TaggableQuestion = { number: string; text: string; marks: number | null };
export type TopicTag = {
  topic: string;
  subtopic: string | null;
  syllabusReference: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  confidence: number;
  needsReview: boolean;
  method: "keyword" | "ai" | "missing_map";
  note: string | null;
};

function keywordScore(text: string, row: TopicMapRow) {
  const normalized = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const matches = row.keywords.filter((keyword) => normalized.includes(` ${keyword.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `));
  if (!matches.length) return 0;
  const phraseBonus = matches.filter((keyword) => keyword.includes(" ")).length * 0.08;
  return Math.min(1, 0.52 + matches.length * 0.12 + phraseBonus);
}

export async function tagQuestionsForSubject(
  client: SupabaseClient,
  subjectCode: string,
  subjectName: string,
  questions: TaggableQuestion[],
  options: { useAi?: boolean } = {},
) {
  const { data, error } = await client.from("topic_maps")
    .select("topic,subtopic,syllabus_reference,keywords")
    .eq("subject_code", subjectCode.padStart(4, "0")).eq("status", "approved");
  if (error) throw error;
  const maps = (data ?? []) as TopicMapRow[];
  const results = new Map<string, TopicTag>();

  if (!maps.length) {
    for (const question of questions) {
      results.set(question.number, {
        topic: "Unclassified", subtopic: null, syllabusReference: null, difficulty: "MEDIUM",
        confidence: 0, needsReview: true, method: "missing_map", note: "No topic map found for this subject.",
      });
    }
    return results;
  }

  const aiCandidates: TaggableQuestion[] = [];
  for (const question of questions) {
    const ranked = maps.map((row) => ({ row, score: keywordScore(question.text, row) })).sort((a, b) => b.score - a.score);
    const best = ranked[0]!;
    if (best.score >= 0.85) {
      results.set(question.number, {
        topic: best.row.topic, subtopic: best.row.subtopic || null, syllabusReference: best.row.syllabus_reference,
        difficulty: "MEDIUM", confidence: best.score, needsReview: false, method: "keyword", note: null,
      });
    } else {
      aiCandidates.push(question);
      if (best.score > 0) {
        results.set(question.number, {
          topic: best.row.topic, subtopic: best.row.subtopic || null, syllabusReference: best.row.syllabus_reference,
          difficulty: "MEDIUM", confidence: best.score, needsReview: true, method: "keyword", note: "Keyword match requires AI review.",
        });
      }
    }
  }

  if (aiCandidates.length && options.useAi !== false) {
    const allowed = maps.map((row) => `${row.topic}${row.subtopic ? ` / ${row.subtopic}` : ""}${row.syllabus_reference ? ` (${row.syllabus_reference})` : ""}`).join("; ");
    const classified = await classifyQuestions(`${subjectName} (${subjectCode}). Choose only from this approved topic map: ${allowed}`, aiCandidates.map(({ number, text }) => ({ number, text })));
    for (const question of aiCandidates) {
      const ai = classified.get(question.number);
      if (!ai) continue;
      const matched = maps.find((row) => row.topic.toLowerCase() === ai.topic.toLowerCase()
        && (!ai.subtopic || !row.subtopic || row.subtopic.toLowerCase() === ai.subtopic.toLowerCase()))
        ?? maps.find((row) => row.topic.toLowerCase() === ai.topic.toLowerCase());
      if (!matched) continue;
      const confidence = results.get(question.number)?.confidence ? Math.max(0.65, results.get(question.number)!.confidence) : 0.62;
      results.set(question.number, {
        topic: canonicalTopic(matched.topic), subtopic: matched.subtopic || ai.subtopic || null,
        syllabusReference: matched.syllabus_reference, difficulty: ai.difficulty,
        confidence, needsReview: confidence < 0.85, method: "ai",
        note: confidence < 0.85 ? "AI classification requires admin review." : null,
      });
    }
  }
  return results;
}
