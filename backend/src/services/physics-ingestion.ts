import pdf from "pdf-parse/lib/pdf-parse.js";
import { createEmbeddings, detectPhysicsTopics, isOpenAiConfigured } from "../lib/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  detectPhysicsPaperMetadata,
  linkQuestionsToAnswers,
  parseMarkSchemeAnswers,
  parsePaperOneQuestions,
  type PaperSession,
} from "./physics-paper-parser";

interface IngestInput {
  supabase: SupabaseClient;
  paperBuffer: Buffer;
  paperFilename: string;
  markingSchemeBuffer: Buffer;
  markingSchemeFilename: string;
  session?: PaperSession;
  variant?: number | null;
}

function topicSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fallbackTopic(text: string) {
  const value = text.toLowerCase();
  if (/lens|mirror|ray|refraction|reflection|light/.test(value)) return "Light";
  if (/current|voltage|resistance|circuit|charge|electric/.test(value)) return "Electricity";
  if (/force|moment|pressure|mass|weight/.test(value)) return "Forces";
  if (/wave|frequency|wavelength/.test(value)) return "Waves";
  if (/heat|temperature|thermal/.test(value)) return "Thermal Physics";
  if (/magnet|induction|transformer/.test(value)) return "Magnetism";
  if (/radioactive|radiation|atom|nucleus/.test(value)) return "Atomic Physics";
  if (/speed|velocity|acceleration|distance|motion/.test(value)) return "Motion";
  if (/energy|power|work/.test(value)) return "Energy";
  return "General Physics";
}

async function requirePhysicsSubject(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("subjects")
    .select("id,name,code,level")
    .eq("code", "5054")
    .eq("level", "O_LEVEL")
    .single();
  if (error || !data) throw new Error("O-Level Physics (5054) is missing from the subjects table.");
  return data;
}

export async function ingestPhysics2024PaperOne(input: IngestInput) {
  const supabaseAdmin = input.supabase;
  const [paperPdf, markingPdf] = await Promise.all([pdf(input.paperBuffer), pdf(input.markingSchemeBuffer)]);
  const detected = detectPhysicsPaperMetadata(paperPdf.text, input.paperFilename);
  const markDetected = detectPhysicsPaperMetadata(markingPdf.text, input.markingSchemeFilename);
  const session = input.session ?? detected.session ?? markDetected.session;
  const variant = input.variant ?? detected.variant ?? markDetected.variant;

  if (!session) throw new Error("Could not detect the exam session. Select May/June, Oct/Nov, or Feb/March.");

  const parsedQuestions = parsePaperOneQuestions(paperPdf.text);
  const answers = parseMarkSchemeAnswers(markingPdf.text);
  const questions = linkQuestionsToAnswers(parsedQuestions, answers);

  if (questions.length < 30) {
    throw new Error(`Only ${questions.length} questions were extracted. Expected at least 30 for Physics Paper 1.`);
  }
  if (answers.size < 30) {
    throw new Error(`Only ${answers.size} marking-scheme answers were extracted. Expected at least 30.`);
  }

  const subject = await requirePhysicsSubject(supabaseAdmin);
  const folder = `O_LEVEL/5054/2024/${session}/paper-1/variant-${variant ?? "unknown"}`;
  const paperPath = `${folder}/question-paper.pdf`;
  const markingPath = `${folder}/marking-scheme.pdf`;

  const [paperUpload, markingUpload] = await Promise.all([
    supabaseAdmin.storage.from("papers").upload(paperPath, input.paperBuffer, {
      contentType: "application/pdf",
      upsert: true,
    }),
    supabaseAdmin.storage.from("marking-schemes").upload(markingPath, input.markingSchemeBuffer, {
      contentType: "application/pdf",
      upsert: true,
    }),
  ]);
  if (paperUpload.error) throw paperUpload.error;
  if (markingUpload.error) throw markingUpload.error;

  let existingPaperQuery = supabaseAdmin
    .from("papers")
    .select("id")
    .eq("subject_id", subject.id)
    .eq("year", 2024)
    .eq("session", session)
    .eq("paper_number", 1)
    .eq("type", "PAST_PAPER");
  existingPaperQuery = variant == null ? existingPaperQuery.is("variant", null) : existingPaperQuery.eq("variant", variant);
  const { data: existingPaper } = await existingPaperQuery.maybeSingle();

  const paperValues = {
    subject_id: subject.id,
    title: `Physics 5054 - 2024 ${session.replace("_", "/")} - Paper 1${variant ? ` Variant ${variant}` : ""}`,
    year: 2024,
    session,
    paper_number: 1,
    type: "PAST_PAPER" as const,
    variant,
    file_url: paperPath,
    level: "O_LEVEL" as const,
    subject_code: "5054",
    storage_path: paperPath,
    raw_text: paperPdf.text,
    ingestion_status: "processing",
    updated_at: new Date().toISOString(),
  };

  const paperQuery = existingPaper
    ? supabaseAdmin.from("papers").update(paperValues).eq("id", existingPaper.id).select("*").single()
    : supabaseAdmin.from("papers").insert(paperValues).select("*").single();
  const { data: paper, error: paperError } = await paperQuery;
  if (paperError || !paper) throw paperError ?? new Error("Could not save paper metadata.");

  const { data: markingScheme, error: markingError } = await supabaseAdmin
    .from("marking_schemes")
    .upsert(
      {
        paper_id: paper.id,
        storage_path: markingPath,
        raw_text: markingPdf.text,
        ingestion_status: "processing",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "paper_id" }
    )
    .select("*")
    .single();
  if (markingError || !markingScheme) throw markingError ?? new Error("Could not save marking scheme metadata.");

  const { error: clearQuestionsError } = await supabaseAdmin.from("questions").delete().eq("paper_id", paper.id);
  if (clearQuestionsError) throw clearQuestionsError;

  const aiTopics = await detectPhysicsTopics(questions.map((question) => ({ number: question.number, text: question.text })));
  const { data: insertedQuestions, error: questionError } = await supabaseAdmin
    .from("questions")
    .insert(
      questions.map((question) => {
        const topics = aiTopics.get(question.number);
        const primaryTopic = topics?.[0]?.name ?? fallbackTopic(question.text);
        return {
          subject_id: subject.id,
          paper_id: paper.id,
          question_number: question.number,
          topic: primaryTopic,
          difficulty: "MEDIUM",
          question: question.text,
          answer: question.answer,
          marking_points: question.answer ? [`Correct option: ${question.answer}`] : [],
          marks: question.marks,
          year: 2024,
          extracted_metadata: { session, paper_number: 1, variant, topics: topics ?? [] },
        };
      })
    )
    .select("id,question_number,question,answer,topic");
  if (questionError || !insertedQuestions) throw questionError ?? new Error("Could not save extracted questions.");

  const topicNames = new Set(insertedQuestions.map((question) => question.topic));
  for (const entries of aiTopics.values()) for (const topic of entries) topicNames.add(topic.name);
  const { data: topicRows, error: topicError } = await supabaseAdmin
    .from("topics")
    .upsert(
      [...topicNames].map((name) => ({ subject_id: subject.id, name, slug: topicSlug(name) })),
      { onConflict: "subject_id,slug" }
    )
    .select("id,name");
  if (topicError || !topicRows) throw topicError ?? new Error("Could not save topics.");

  const topicIds = new Map(topicRows.map((topic) => [topic.name, topic.id]));
  const questionTopicRows = insertedQuestions.flatMap((question) => {
    const detectedTopics = aiTopics.get(question.question_number) ?? [{ name: question.topic, confidence: 0.5 }];
    return detectedTopics.flatMap((topic) => {
      const topicId = topicIds.get(topic.name);
      return topicId
        ? [{ question_id: question.id, topic_id: topicId, confidence: topic.confidence, source: aiTopics.has(question.question_number) ? "ai" : "fallback" }]
        : [];
    });
  });
  if (questionTopicRows.length > 0) {
    const { error } = await supabaseAdmin.from("question_topics").insert(questionTopicRows);
    if (error) throw error;
  }

  const chunks = insertedQuestions.flatMap((question) => {
    const reference = `Physics 5054, 2024 ${session.replace("_", "/")}, Paper 1${variant ? ` Variant ${variant}` : ""}, Question ${question.question_number}`;
    const questionChunk = {
      source_type: "question",
      paper_id: paper.id,
      question_id: question.id,
      marking_scheme_id: null,
      note_id: null,
      subject_id: subject.id,
      level: "O_LEVEL",
      year: 2024,
      session,
      paper_number: 1,
      question_number: question.question_number,
      content: `${reference}\nQuestion: ${question.question}`,
      metadata: { reference, topic: question.topic },
    };
    const markingChunk = question.answer
      ? {
          source_type: "marking_scheme",
          paper_id: paper.id,
          question_id: null,
          marking_scheme_id: markingScheme.id,
          note_id: null,
          subject_id: subject.id,
          level: "O_LEVEL",
          year: 2024,
          session,
          paper_number: 1,
          question_number: question.question_number,
          content: `${reference}\nMarking scheme: correct option ${question.answer}.`,
          metadata: { reference, answer: question.answer },
        }
      : null;
    return markingChunk ? [questionChunk, markingChunk] : [questionChunk];
  });

  const embeddings = isOpenAiConfigured() ? await createEmbeddings(chunks.map((chunk) => chunk.content)) : [];
  const { error: clearChunkError } = await supabaseAdmin.from("document_chunks").delete().eq("paper_id", paper.id);
  if (clearChunkError) throw clearChunkError;
  const { error: chunkError } = await supabaseAdmin.from("document_chunks").insert(
    chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] ?? null }))
  );
  if (chunkError) throw chunkError;

  const finalStatus = embeddings.length === chunks.length ? "ready" : "ready_without_embeddings";
  const [paperReady, markingReady] = await Promise.all([
    supabaseAdmin.from("papers").update({ ingestion_status: finalStatus }).eq("id", paper.id),
    supabaseAdmin.from("marking_schemes").update({ ingestion_status: finalStatus }).eq("id", markingScheme.id),
  ]);
  if (paperReady.error) throw paperReady.error;
  if (markingReady.error) throw markingReady.error;

  return {
    paper: {
      id: paper.id,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectCode: subject.code,
      level: subject.level,
      title: paper.title,
      year: paper.year,
      session: paper.session,
      paperNumber: paper.paper_number,
      type: paper.type,
      variant: paper.variant,
      fileUrl: paper.storage_path,
      markingSchemeUrl: markingPath,
    },
    questionsExtracted: insertedQuestions.length,
    answersLinked: insertedQuestions.filter((question) => Boolean(question.answer)).length,
    chunksCreated: chunks.length,
    embeddingsCreated: embeddings.length,
    status: finalStatus,
    published: true,
  };
}
