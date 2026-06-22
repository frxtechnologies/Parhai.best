import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalTopic, fallbackTopicForSubject } from "./rag-utils";
import { splitResourceChunks } from "./resource-processor";

type LegacyPaper = {
  id: number; subject_id: number; title: string; year: number; session: string; paper_number: number;
  variant: number | null; storage_path: string | null; file_url: string | null; raw_text: string | null;
  original_filename: string | null; file_type: string | null; file_size_bytes: number | null; source_type: string;
  level: "O_LEVEL" | "A_LEVEL" | null; subjects: { name: string; code: string; level: "O_LEVEL" | "A_LEVEL"; board: string } | null;
};

async function finishImportedResource(client: SupabaseClient, resourceId: number, extractedText: string, chunks: string[], metadata: Record<string, unknown>) {
  const { error: clearError } = await client.from("ai_chunks").delete().eq("resource_id", resourceId);
  if (clearError) throw clearError;
  if (chunks.length) {
    const { error: chunkError } = await client.from("ai_chunks").insert(chunks.map((content, chunkIndex) => ({
      subject_id: metadata.subjectId, resource_id: resourceId, chunk_index: chunkIndex, content, metadata,
    })));
    if (chunkError) throw chunkError;
  }
  const now = new Date().toISOString();
  const { error: resourceError } = await client.from("resources").update({ extracted_text: extractedText || null, status: "processed", processing_status: "processed", processing_error: null, updated_at: now }).eq("id", resourceId);
  if (resourceError) throw resourceError;
  const { data: jobs, error: jobsError } = await client.from("processing_jobs").update({ status: "completed", error_message: null, completed_at: now, updated_at: now }).eq("resource_id", resourceId).select("id");
  if (jobsError) throw jobsError;
  if (!jobs?.length) {
    const { error } = await client.from("processing_jobs").insert({ resource_id: resourceId, status: "completed", completed_at: now, updated_at: now });
    if (error) throw error;
  }
}

export async function importLegacyPapers(client: SupabaseClient) {
  const { data: papersData, error: papersError } = await client.from("papers")
    .select("id,subject_id,title,year,session,paper_number,variant,storage_path,file_url,raw_text,original_filename,file_type,file_size_bytes,source_type,level,subjects(name,code,level,board)")
    .order("id");
  if (papersError) throw papersError;
  const papers = (papersData ?? []) as unknown as LegacyPaper[];
  let importedResources = 0;
  let importedQuestions = 0;
  let importedChunks = 0;

  for (const paper of papers) {
    const subject = Array.isArray(paper.subjects) ? paper.subjects[0] : paper.subjects;
    const storagePath = paper.storage_path ?? paper.file_url;
    if (!storagePath) continue;
    const bucket = paper.source_type === "EXAMINER_REPORT" ? "examiner-reports" : "papers";
    const resourceType = paper.source_type === "QUESTION_PAPER" ? "PAST_PAPER" : "OTHER";
    const { data: resource, error: resourceError } = await client.from("resources").upsert({
      subject_id: paper.subject_id,
      level: paper.level ?? subject?.level ?? "O_LEVEL",
      board: subject?.board ?? "CAMBRIDGE",
      title: paper.title,
      resource_type: resourceType,
      year: paper.year,
      session: paper.session,
      paper_code: String(paper.paper_number),
      variant: paper.variant,
      bucket,
      storage_path: storagePath,
      file_path: storagePath,
      file_url: storagePath,
      original_filename: paper.original_filename ?? paper.title,
      file_type: paper.file_type ?? "application/pdf",
      file_size_bytes: paper.file_size_bytes,
      extracted_text: paper.raw_text,
      status: "processed",
      processing_status: "processed",
      legacy_source: "papers",
      legacy_source_id: paper.id,
    }, { onConflict: "legacy_source,legacy_source_id" }).select("id").single();
    if (resourceError || !resource) throw resourceError ?? new Error(`Could not import legacy paper ${paper.id}.`);
    const resourceId = Number(resource.id);
    importedResources++;

    const { data: questionData, error: questionError } = await client.from("questions")
      .select("id,question_number,topic,subtopic,difficulty,marks,question,question_text,extracted_text,answer,ai_summary")
      .eq("paper_id", paper.id).order("id");
    if (questionError) throw questionError;
    const questionRows = questionData ?? [];
    for (const question of questionRows) {
      const questionText = String(question.question_text ?? question.question ?? question.extracted_text ?? "").trim();
      if (!questionText) continue;
      const topic = question.topic ? canonicalTopic(String(question.topic)) : fallbackTopicForSubject(questionText, subject?.name ?? "Subject");
      const { error } = await client.from("question_index").upsert({
        subject_id: paper.subject_id,
        resource_id: resourceId,
        year: paper.year,
        session: paper.session,
        paper_code: String(paper.paper_number),
        variant: paper.variant,
        question_number: String(question.question_number ?? question.id),
        topic,
        subtopic: question.subtopic,
        difficulty: question.difficulty ?? "MEDIUM",
        marks: question.marks,
        question_text: questionText,
        answer_text: question.answer ?? question.ai_summary,
        source_file: paper.original_filename ?? paper.title,
        legacy_source: "questions",
        legacy_source_id: question.id,
      }, { onConflict: "legacy_source,legacy_source_id" });
      if (error) throw error;
      importedQuestions++;
    }
    const extractedText = paper.raw_text?.trim() || questionRows.map((q) => [q.question_text ?? q.question, q.extracted_text, q.answer].filter(Boolean).join("\n")).join("\n\n");
    const chunks = splitResourceChunks(extractedText);
    importedChunks += chunks.length;
    await finishImportedResource(client, resourceId, extractedText, chunks, {
      subjectId: paper.subject_id, title: paper.title, subject: subject?.name, subjectCode: subject?.code,
      level: paper.level ?? subject?.level, board: subject?.board, type: resourceType, year: paper.year,
      session: paper.session, paperCode: String(paper.paper_number), variant: paper.variant,
      sourceFile: paper.original_filename ?? paper.title, legacyPaperId: paper.id,
    });

    const { data: scheme, error: schemeError } = await client.from("marking_schemes")
      .select("id,storage_path,raw_text,original_filename,file_type,file_size_bytes").eq("paper_id", paper.id).maybeSingle();
    if (schemeError) throw schemeError;
    if (scheme?.storage_path) {
      const { data: schemeResource, error } = await client.from("resources").upsert({
        subject_id: paper.subject_id, level: paper.level ?? subject?.level ?? "O_LEVEL", board: subject?.board ?? "CAMBRIDGE",
        title: `${paper.title} Marking Scheme`, resource_type: "MARKING_SCHEME", year: paper.year, session: paper.session,
        paper_code: String(paper.paper_number), variant: paper.variant, bucket: "marking-schemes", storage_path: scheme.storage_path,
        file_path: scheme.storage_path, file_url: scheme.storage_path, original_filename: scheme.original_filename ?? `${paper.title}-ms.pdf`,
        file_type: scheme.file_type ?? "application/pdf", file_size_bytes: scheme.file_size_bytes, extracted_text: scheme.raw_text,
        status: "processed", processing_status: "processed", related_resource_id: resourceId,
        legacy_source: "marking_schemes", legacy_source_id: scheme.id,
      }, { onConflict: "legacy_source,legacy_source_id" }).select("id").single();
      if (error || !schemeResource) throw error ?? new Error(`Could not import marking scheme ${scheme.id}.`);
      importedResources++;
      const schemeText = String(scheme.raw_text ?? "").trim();
      const schemeChunks = splitResourceChunks(schemeText);
      importedChunks += schemeChunks.length;
      await finishImportedResource(client, Number(schemeResource.id), schemeText, schemeChunks, {
        subjectId: paper.subject_id, title: `${paper.title} Marking Scheme`, subject: subject?.name, type: "MARKING_SCHEME",
        year: paper.year, session: paper.session, paperCode: String(paper.paper_number), variant: paper.variant,
        sourceFile: scheme.original_filename ?? `${paper.title}-ms.pdf`, legacyMarkingSchemeId: scheme.id,
      });
    }
  }
  return { legacyPapers: papers.length, importedResources, importedQuestions, importedChunks };
}
