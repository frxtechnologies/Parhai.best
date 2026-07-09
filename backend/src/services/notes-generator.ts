import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAiAnswer } from "../lib/ai-service";
import { retrieveGroundedContext, type GroundedSource, type RetrievalSubject } from "./rag-retrieval";

/**
 * AI Notes Generator.
 *
 * Produces revision material grounded in the indexed Cambridge content
 * (syllabus, notes, past papers, marking schemes, examiner reports) rather than
 * free LLM invention. Every generation retrieves RAG context first and instructs
 * the model to cite it and avoid fabricating facts.
 */

export const NOTE_TYPES = [
  "summary",
  "detailed",
  "flashcards",
  "definitions",
  "formula_sheet",
  "checklist",
  "mind_map",
  "memory_tricks",
  "last_minute",
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  summary: "Summary Notes",
  detailed: "Detailed Notes",
  flashcards: "Flashcards",
  definitions: "Key Definitions",
  formula_sheet: "Formula Sheet",
  checklist: "Revision Checklist",
  mind_map: "Mind Map",
  memory_tricks: "Memory Tricks",
  last_minute: "Last-Minute Revision",
};

const NOTE_TYPE_INSTRUCTIONS: Record<NoteType, string> = {
  summary: "Write concise summary notes: the key points a student must know, grouped under clear `##` headings with short bullet points.",
  detailed: "Write thorough revision notes with `##` section headings, explanations, worked examples, and bullet points covering the topic in depth.",
  flashcards: "Produce flashcards as a markdown list. Format each as `- **Q:** <question>` on one line and `  **A:** <answer>` on the next. Cover the most examinable points.",
  definitions: "List the key definitions as a markdown table with columns | Term | Definition |. Use precise Cambridge wording.",
  formula_sheet: "Produce a formula sheet as a markdown table with columns | Quantity | Formula | Symbols & units |. Include only formulas relevant to the topic.",
  checklist: "Produce a revision checklist as a markdown task list (`- [ ] ...`) of every subtopic and skill the student should be able to do.",
  mind_map: "Produce a structured mind map using nested markdown bullet points: the central topic, main branches, and sub-branches, three levels deep where useful.",
  memory_tricks: "Give memory tricks, mnemonics, and analogies as a bullet list to help recall the key facts of this topic.",
  last_minute: "Write a tight last-minute revision sheet: only the highest-yield facts, common exam traps, and must-remember formulas, in short bullets.",
};

export interface GenerateNotesInput {
  subjectId: number;
  topic: string;
  noteType: NoteType;
}

export interface GeneratedNotes {
  subject: { id: number; name: string; code: string };
  topic: string;
  noteType: NoteType;
  markdown: string;
  grounded: boolean;
  sources: Array<{ index: number; type: string; reference: string }>;
}

const SYSTEM =
  "You are an expert Cambridge examinations teacher creating revision material. Base your notes on the provided verified " +
  "sources and cite them inline as [S#]. Do not invent facts, formulas, or exam statistics. If the sources do not cover " +
  "something, say so rather than guessing. Use clean, well-structured markdown.";

function buildPrompt(subject: RetrievalSubject, topic: string, noteType: NoteType, sources: GroundedSource[]): string {
  const sourceBlock = sources.length
    ? sources.map((source, index) => `[S${index + 1}] (${source.sourceType}) ${source.reference}\n${source.content}`).join("\n\n")
    : "No verified Cambridge sources were found for this topic. Note this clearly and keep guidance general and cautious.";
  return [
    `Subject: ${subject.name} (${subject.code}). Topic: ${topic}.`,
    `Task: ${NOTE_TYPE_INSTRUCTIONS[noteType]}`,
    `\nVerified Cambridge sources (cite as [S#]):\n${sourceBlock}`,
    "\nGenerate the requested material now in markdown. Cite [S#] wherever you use a source.",
  ].join("\n");
}

export async function generateNotes(client: SupabaseClient, input: GenerateNotesInput): Promise<GeneratedNotes> {
  const topic = input.topic.trim();
  if (!topic) throw new Error("Enter a topic to generate notes for.");

  const { data: subjectRow } = await client.from("subjects").select("id,name,code").eq("id", input.subjectId).maybeSingle();
  if (!subjectRow) throw new Error("Subject not found.");
  const subject = subjectRow as RetrievalSubject;

  const sources = await retrieveGroundedContext(client, subject, topic, { limit: 12 });
  const markdown = await generateAiAnswer(SYSTEM, buildPrompt(subject, topic, input.noteType, sources));

  return {
    subject,
    topic,
    noteType: input.noteType,
    markdown,
    grounded: sources.length > 0,
    sources: sources.map((source, index) => ({ index: index + 1, type: source.sourceType, reference: source.reference })),
  };
}
