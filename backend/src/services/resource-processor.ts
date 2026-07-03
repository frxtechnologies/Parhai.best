import type { SupabaseClient } from "@supabase/supabase-js";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { generateDocumentEmbeddings, AI_EMBEDDING_MODEL } from "../lib/ai-service";
import { createAndStoreQuestionScreenshots, screenshotMode } from "./question-screenshots";
import { tagQuestionsForSubject } from "./topic-tagging";
import { classifyQuestionTypeDetailed } from "./source-grounded-query";
import { classifyMarkingSchemeSection, type MarkingAnswerType } from "./marking-scheme-intelligence";

export type ProcessableResource = {
  id: number;
  subject_id: number;
  level: "O_LEVEL" | "A_LEVEL";
  board: string;
  title: string;
  resource_type: string;
  year: number | null;
  session: string | null;
  paper_code: string | null;
  variant: number | null;
  bucket: string;
  storage_path: string;
  file_type: string | null;
  original_filename: string;
  related_resource_id: number | null;
  subjects: { name: string; code: string; board: string } | null;
};

export type IndexedQuestion = {
  number: string;
  text: string;
  marks: number | null;
};

export type MarkingSchemeAnswer = IndexedQuestion & {
  baseNumber: string;
  questionPart: string | null;
  cleanText: string;
  markingPoints: string[];
  confidence: number;
  answerType:MarkingAnswerType;
  isQuestionSpecific:boolean;
  detectionReason:string;
};

export function normalizeResourceText(value: string) {
  return value.replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function splitResourceChunks(text: string, maxLength = 1400, overlap = 180) {
  const normalized = normalizeResourceText(text);
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxLength, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf("\n", end), normalized.lastIndexOf(". ", end));
      if (boundary > start + Math.floor(maxLength * 0.6)) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export function chunkTypeForResource(resourceType:string) {
  return resourceType==="MARKING_SCHEME"?"marking_scheme_answer"
    :resourceType==="SYLLABUS"?"syllabus_section"
    :resourceType==="EXAMINER_REPORT"?"examiner_insight"
    :resourceType==="GRADE_THRESHOLD"?"grade_threshold"
    :resourceType==="NOTE"||resourceType==="NOTES"?"note_section"
    :"resource_text";
}

function readMarks(text: string) {
  const matches = [...text.matchAll(/(?:\[|\()\s*(\d{1,2})\s*(?:marks?)?\s*(?:\]|\))/gi)];
  return matches.length ? matches.reduce((total, match) => total + Number(match[1]), 0) : null;
}

export function cleanQuestionText(text: string) {
  return text
    .replace(/\b(?:DO NOT WRITE IN THIS MARGIN|TURN OVER|BLANK PAGE|UCLES|Cambridge University Press & Assessment)\b/gi, " ")
    .replace(/\b(?:INSTRUCTIONS|INFORMATION)\s+(?=(?:Answer|You must|Use a|Write|If you))/gi, " ")
    .replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, " ")
    .replace(/\b\d{4}\/(?:[0-9]{1,2}|[A-Z]{1,2})\/(?:M\/J|O\/N|F\/M)\/\d{2}\b/gi, " ")
    .replace(/\*+\s*\d+\s*\*+/g, " ")
    .replace(/(?:\u0000|\u0001|\u0002|\u0003)+/g, " ")
    .replace(/\.{5,}/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .replace(/[^\p{L}\p{N}\s()[\].,;:?!+\-=/°%'"£$]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function questionTextQuality(text: string): "good" | "acceptable" | "needs_review" | "failed" {
  const value = text.trim();
  if (/\b(answer all questions|write your name|blank page|do not write in this margin|instructions|information)\b/i.test(value)) return "failed";
  if (value.length < 20 || !/\b(calculate|explain|describe|state|determine|find|show|prove|draw|plot|write|complete|give)\b/i.test(value)) return "needs_review";
  return value.length >= 50 ? "good" : "acceptable";
}

function textQualityScore(status: ReturnType<typeof questionTextQuality>) {
  return status === "good" ? 0.95 : status === "acceptable" ? 0.75 : status === "needs_review" ? 0.35 : 0.10;
}

export function splitNumberedQuestions(text: string): IndexedQuestion[] {
  const lines = normalizeResourceText(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const rows: Array<{ number: string; lines: string[] }> = [];
  let current: { number: string; lines: string[] } | null = null;
  let baseNumber: string | null = null;

  const flush = () => {
    // Cambridge mark schemes often contain very short valid answers such as
    // "1.52 1" or "–4 1". Requiring eight characters silently discarded
    // those keys and left otherwise indexed questions unlinked.
    if (current && current.lines.join(" ").trim().length >= 2) rows.push(current);
  };

  for (const line of lines) {
    const main = line.match(/^(?:question\s+|q\s*)?(\d{1,2})(?:\s*(\([a-z]\)(?:\([ivx]+\))?))?(?:[.):\-]|\s)+\s*(.*)$/i);
    const subpart = line.match(/^\(([a-z])\)(?:\s*\(([ivx]+)\))?\s*(.*)$/i);
    if (main && Number(main[1]) <= 99) {
      flush();
      baseNumber = String(Number(main[1]));
      current = { number: `${baseNumber}${main[2] ?? ""}`.replace(/\s/g, ""), lines: main[3] ? [main[3]] : [] };
      continue;
    }
    if (subpart && baseNumber) {
      flush();
      current = { number: `${baseNumber}(${subpart[1]!.toLowerCase()})${subpart[2] ? `(${subpart[2].toLowerCase()})` : ""}`, lines: subpart[3] ? [subpart[3]] : [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();

  const unique = new Map<string, IndexedQuestion>();
  for (const row of rows) {
    const questionText = row.lines.join(" ").replace(/\s+/g, " ").trim();
    const existing = unique.get(row.number);
    unique.set(row.number, existing
      ? { number: row.number, text: `${existing.text} ${questionText}`.trim(), marks: existing.marks ?? readMarks(questionText) }
      : { number: row.number, text: questionText, marks: readMarks(questionText) });
  }
  return [...unique.values()];
}

export function cleanMarkingSchemeText(text: string) {
  return normalizeResourceText(text)
    .replace(/\b(?:UCLES|Cambridge University Press & Assessment|Generic Marking Principles)\b/gi, " ")
    .replace(/\b(?:Page\s+\d+\s+of\s+\d+|MARK SCHEME|PUBLISHED)\b/gi, " ")
    .replace(/\bCambridge O Level\b/gi, " ")
    .replace(/\b(?:May\/June|Oct\/Nov|Feb\/March)\s+20\d{2}\b/gi, " ")
    .replace(/\bQuestion\s+Answer\s+Marks(?:\s+Partial\s+Marks)?\b/gi, " ")
    .replace(/\b\d{4}\/\d{2}\b/g, " ")
    .replace(/\b\d{4}\/(?:[0-9]{1,2}|[A-Z]{1,2})\/(?:M\/J|O\/N|F\/M)\/\d{2}\b/gi, " ")
    .replace(/\*+\s*\d+\s*\*+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractMarkingSchemeAnswers(text: string): MarkingSchemeAnswer[] {
  const tableStart = text.search(/\bQuestion\s+Answer\s+Marks(?:\s+Partial\s+Marks)?\b/i);
  const tableText = tableStart >= 0 ? text.slice(tableStart) : text;
  const mcqAnswers = new Map<string, MarkingSchemeAnswer>();
  for (const line of normalizeResourceText(tableText).split("\n")) {
    const pairs = [...line.matchAll(/(?:^|\s)(\d{1,2})\s+([A-D])(?=\s|$)/gi)];
    for (const pair of pairs) {
      const number=String(Number(pair[1])),key=pair[2]!.toUpperCase();
       mcqAnswers.set(number,{number,text:key,marks:1,baseNumber:number,questionPart:null,cleanText:key,markingPoints:[key],confidence:0.99,answerType:"question_answer",isQuestionSpecific:true,detectionReason:"Numbered multiple-choice answer key"});
    }
  }
  if(mcqAnswers.size>=10) return [...mcqAnswers.values()].sort((a,b)=>Number(a.baseNumber)-Number(b.baseNumber));
  return splitNumberedQuestions(tableText).map((answer) => {
    const baseNumber = answer.number.match(/^\d+/)?.[0] ?? answer.number;
    const questionPart = answer.number.slice(baseNumber.length) || null;
    const cleanText = cleanMarkingSchemeText(answer.text);
    const markingPoints = cleanText.split(/\s*(?:;|\n|•)\s*/).map((point) => point.trim()).filter((point) => point.length > 1);
    const classified=classifyMarkingSchemeSection(`${answer.number} ${cleanText}`,{questionNumber:baseNumber,questionPart,marks:answer.marks});
     return {
      ...answer,
      baseNumber,
      questionPart,
      cleanText,
      markingPoints,
       confidence: classified.confidence,
       answerType:classified.answerType,isQuestionSpecific:classified.isQuestionSpecific,detectionReason:classified.reason,
    };
  }).filter((answer) => answer.cleanText.length > 1);
}

export async function extractFileText(resource: ProcessableResource, buffer: Buffer) {
  const lowerName = resource.original_filename.toLowerCase();
  const isPdf = resource.file_type === "application/pdf" || lowerName.endsWith(".pdf");
  const isText = resource.file_type?.startsWith("text/") || lowerName.endsWith(".txt");
  if (isPdf) return normalizeResourceText((await pdf(buffer)).text);
  if (isText) return normalizeResourceText(buffer.toString("utf8"));
  throw new Error("Only PDF and plain-text processing is supported.");
}

async function resolveQuestionPaper(client: SupabaseClient, resource: ProcessableResource) {
  if (resource.related_resource_id) return resource.related_resource_id;
  let query = client.from("resources").select("id")
    .eq("subject_id", resource.subject_id)
    .eq("level", resource.level)
    .eq("resource_type", "PAST_PAPER")
    .eq("year", resource.year);
  query = resource.session == null ? query.is("session", null) : query.eq("session", resource.session);
  query = resource.paper_code == null ? query.is("paper_code", null) : query.eq("paper_code", resource.paper_code);
  query = resource.variant == null ? query.is("variant", null) : query.eq("variant", resource.variant);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.id ? Number(data.id) : null;
}

export async function linkAnswerRows(client: SupabaseClient, paperResourceId: number, schemeResourceId: number, answers: MarkingSchemeAnswer[]) {
  let linked = 0;
  const{data:scheme,error:schemeError}=await client.from("resources").select("id,subject_id,level,year,session,paper_number,paper_code,variant,subjects(code)").eq("id",schemeResourceId).single();
  if(schemeError||!scheme)throw schemeError??new Error("Marking scheme resource not found.");
  const schemeSubject=Array.isArray(scheme.subjects)?scheme.subjects[0]:scheme.subjects;
  const schemePaper=Number(scheme.paper_number??scheme.paper_code);
  await client.from("marking_scheme_answers").delete().eq("resource_id", schemeResourceId);
  const { data: savedAnswers, error: saveError } = await client.from("marking_scheme_answers").insert(answers.map((answer) => ({
    resource_id: schemeResourceId, question_number: answer.baseNumber, question_part: answer.questionPart,
     subject_id:scheme.subject_id,syllabus_code:schemeSubject?.code,level:scheme.level,year:scheme.year,session:scheme.session,
     paper_number:schemePaper,variant:scheme.variant,component_variant_code:schemePaper&&scheme.variant?`${schemePaper}${scheme.variant}`:null,
     raw_answer_text: answer.text, clean_answer_text: answer.cleanText, normalized_text:answer.cleanText, marking_points: answer.markingPoints,
     raw_text:answer.text,answer_text:answer.cleanText,marking_points_json:answer.markingPoints,
     marks: answer.marks, confidence: answer.confidence,extraction_confidence:answer.confidence,
     answer_type:answer.answerType,is_question_specific:answer.isQuestionSpecific,detection_reason:answer.detectionReason,
     link_confidence:answer.isQuestionSpecific?answer.confidence:0,linked_status:answer.isQuestionSpecific?"unlinked":"needs_review",
   }))).select("id,question_number,question_part,clean_answer_text,confidence,answer_type,is_question_specific,extraction_confidence,link_confidence");
  if (saveError) throw saveError;
  for (const answer of savedAnswers ?? []) {
    if(answer.answer_type!=="question_answer"||!answer.is_question_specific||Number(answer.extraction_confidence??answer.confidence)<.8)continue;
    const canonicalNumber = `${answer.question_number}${answer.question_part ?? ""}`;
    const { data, error } = await client.from("question_index").update({
      answer_text: answer.clean_answer_text, marking_scheme_answer_id: answer.id,
      // The equality filter below targets the exact canonical question.
      // Whole-number MCQs are exact links even without a subpart.
       marking_scheme_link_status: "linked_exact",
      marking_scheme_link_confidence: answer.confidence, updated_at: new Date().toISOString(),
    })
      .eq("resource_id", paperResourceId).eq("question_number", canonicalNumber).select("id");
    if (error) throw error;
    linked += data?.length ?? 0;
    // A scheme can contain a question-level answer while question_index also
    // contains separate parts. Link any still-empty parts as partial even when
    // an exact base row was found.
    const baseNumber = answer.question_number;
    const { data: partial, error: partialError } = await client.from("question_index").update({
      answer_text: answer.clean_answer_text, marking_scheme_answer_id: answer.id,
      marking_scheme_link_status: "partial", marking_scheme_link_confidence: Math.min(Number(answer.confidence), 0.75),
      updated_at: new Date().toISOString(),
    }).eq("resource_id", paperResourceId).like("question_number", `${baseNumber}(%`).is("marking_scheme_answer_id", null).select("id");
    if (partialError) throw partialError;
    linked += partial?.length ?? 0;
    await client.from("marking_scheme_answers").update({linked_status:(data?.length??0)>0?"linked":(partial?.length??0)>0?"partial":"unlinked",question_id:data?.[0]?.id??null,link_confidence:(data?.length??0)>0?Number(answer.confidence):Math.min(Number(answer.confidence),.75)}).eq("id",answer.id);
  }
  return linked;
}

export type PipelineStep="extracting_text"|"rendering_pages"|"detecting_metadata"|"splitting_questions"|"tagging_topics"|"linking_marking_scheme"|"creating_embeddings"|"updating_analytics";
export async function processResourceContent(client: SupabaseClient, resource: ProcessableResource, onStep?: (step:PipelineStep,progress:number)=>Promise<void>) {
  if (!resource.bucket?.trim() || !resource.storage_path?.trim()) {
    throw new Error(`Storage configuration is incomplete for resource ${resource.id}: bucket or file path is missing.`);
  }
  const { data: file, error: downloadError } = await client.storage.from(resource.bucket).download(resource.storage_path);
  if (downloadError || !file) {
    const reason = downloadError?.message === "Object not found" ? "file was not found" : "download failed";
    throw new Error(`Supabase Storage ${reason} for resource ${resource.id} (${resource.bucket}/${resource.storage_path}).`);
  }
  await onStep?.("detecting_metadata",15);
  await onStep?.("extracting_text",25);
  const extractedText = await extractFileText(resource, Buffer.from(await file.arrayBuffer()));
  if (!extractedText) throw new Error("No text was extracted. This appears to be a scanned PDF and OCR is needed before it can be processed.");

  const chunks = splitResourceChunks(extractedText);
  if (!chunks.length) throw new Error("No searchable text chunks could be created.");
  await onStep?.("creating_embeddings",35);
  const embeddings = await generateDocumentEmbeddings(chunks);
  const metadata = {
    title: resource.title,
    subject: resource.subjects?.name,
    subjectCode: resource.subjects?.code,
    level: resource.level,
    board: resource.board || resource.subjects?.board,
    type: resource.resource_type,
    year: resource.year,
    session: resource.session,
    paperCode: resource.paper_code,
    variant: resource.variant,
    sourceFile: resource.original_filename,
  };

  const { error: clearChunkError } = await client.from("ai_chunks").delete().eq("resource_id", resource.id);
  if (clearChunkError) throw clearChunkError;
  const { data:savedChunks,error: chunkError } = await client.from("ai_chunks").insert(chunks.map((content, index) => ({
    subject_id: resource.subject_id,
    resource_id: resource.id,
    chunk_index: index,
    content,
    embedding: `[${embeddings[index]!.join(",")}]`,
    embedding_model: AI_EMBEDDING_MODEL,
    metadata,
  }))).select("id,chunk_index");
  if (chunkError) throw chunkError;
  // Keep typed chunks for notes/syllabi/reports while ai_chunks remains the
  // single vector source used by the existing RAG retrieval path.
  const {error:clearTypedError}=await client.from("resource_chunks").delete().eq("resource_id",resource.id);
  if(!clearTypedError){
    let chunkTags=new Map<string,any>();
    if(!["PAST_PAPER","MARKING_SCHEME","WORKSHEET","TEST","TOPICAL"].includes(resource.resource_type)){
      try{chunkTags=await tagQuestionsForSubject(client,resource.subjects?.code??"",resource.subjects?.name??"Subject",chunks.map((text,index)=>({number:String(index+1),text,marks:null})))}catch{chunkTags=new Map()}
    }
    const{data:typedChunks}=await client.from("resource_chunks").insert(chunks.map((content,index)=>{
      const tag=chunkTags.get(String(index+1));
      return {
      resource_id:resource.id,subject_id:resource.subject_id,level:resource.level,board:resource.board||resource.subjects?.board,
      year:resource.year,session:resource.session,paper_code:resource.paper_code,variant:resource.variant,
      chunk_type:chunkTypeForResource(resource.resource_type),
      title:`${resource.title} · Part ${index+1}`,content,extracted_text:content,
      topic:tag?.topic??null,subtopic:tag?.subtopic??null,embedding:`[${embeddings[index]!.join(",")}]`,
      source_reference:`${resource.original_filename}#chunk-${index+1}`,
      metadata_json:{...metadata,chunkIndex:index,confidence:tag?.confidence??null,needsReview:tag?.needsReview??false},
      ai_chunk_id:savedChunks?.find(row=>Number(row.chunk_index)===index)?.id??null,
    }})).select("id,topic,subtopic,metadata_json");
    if(typedChunks?.length)await client.from("topic_tagging_audits").insert(typedChunks.map(chunk=>({source_type:"resource_chunk",source_id:chunk.id,resource_id:resource.id,predicted_topic:chunk.topic,predicted_subtopic:chunk.subtopic,new_topic:chunk.topic,new_subtopic:chunk.subtopic,confidence:Number((chunk.metadata_json as any)?.confidence??0),needs_review:Boolean((chunk.metadata_json as any)?.needsReview),review_status:(chunk.metadata_json as any)?.needsReview?"needs_review":"verified"})));
  }

  let indexedQuestions = 0;
  let linkedAnswers = 0;
  let classificationWarning: string | null = null;
  const numbered = splitNumberedQuestions(extractedText);
  await onStep?.("splitting_questions",40);
  const questionBearing = ["PAST_PAPER", "WORKSHEET", "TEST", "TOPICAL"].includes(resource.resource_type);
  if (questionBearing && numbered.length === 0) {
    throw new Error("Question extraction failed: text was extracted, but no numbered questions were detected. Review the PDF or run OCR.");
  }

  if (questionBearing && numbered.length) {
    await onStep?.("tagging_topics",55);
    let classified = new Map();
    try {
      classified = await tagQuestionsForSubject(client, resource.subjects?.code ?? "", resource.subjects?.name ?? "Subject", numbered);
      const reviewCount = [...classified.values()].filter((tag) => tag.needsReview).length;
      if (reviewCount) classificationWarning = `${reviewCount} questions need topic review.`;
    } catch (error) {
      classificationWarning = error instanceof Error ? error.message : "AI topic classification failed.";
    }
    const { error: clearQuestionError } = await client.from("question_index").delete().eq("resource_id", resource.id);
    if (clearQuestionError) throw clearQuestionError;
    const { data: savedQuestions, error: questionError } = await client.from("question_index").insert(numbered.map((question) => {
      const tag = classified.get(question.number);
      const cleanedText = cleanQuestionText(question.text);
      const textQuality = questionTextQuality(cleanedText);
      const questionType=classifyQuestionTypeDetailed(cleanedText);
      return {
        subject_id: resource.subject_id,
        resource_id: resource.id,
        year: resource.year,
        session: resource.session,
        paper_code: resource.paper_code,
        variant: resource.variant,
        question_number: question.number,
        topic: tag?.topic ?? "Unclassified",
        subtopic: tag?.subtopic ?? null,
        difficulty: tag?.difficulty ?? "MEDIUM",
        question_type: questionType.questionType,
        question_type_confidence:questionType.confidence,
        question_type_needs_review:questionType.needsReview,
        question_type_reason:questionType.reason,
        question_type_metadata:{subtypes:questionType.subtypes},
        marks: question.marks,
        total_marks: question.marks,
        raw_extracted_text: question.text,
        clean_question_text: cleanedText,
        display_question_text: cleanedText,
        question_text: cleanedText,
        text_quality_status: textQuality,
        text_quality_score: textQualityScore(textQuality),
        question_part: question.number.match(/(\(.+\))$/)?.[1] ?? null,
        marking_scheme_link_status: "unlinked",
        source_file: resource.original_filename,
        syllabus_reference: tag?.syllabusReference ?? null,
        confidence: tag?.confidence ?? 0,
        needs_review: textQuality === "needs_review" || textQuality === "failed" || (tag?.needsReview ?? true),
        tagging_method: tag?.method ?? "missing_map",
        topic_source:tag?.method==="manual"?"admin_verified":tag?.method?.includes("ai")?"ai_tagged":tag?"inferred_from_text":"unknown",
        tagging_note: tag?.note ?? "No topic map found for this subject.",
        topic_classified: Boolean(tag && !tag.needsReview && tag.confidence >= 0.85),
        student_verified: textQuality !== "needs_review" && textQuality !== "failed" && Boolean(tag && !tag.needsReview && tag.confidence >= 0.60),
        review_status:textQuality !== "needs_review" && textQuality !== "failed" && Boolean(tag && !tag.needsReview && tag.confidence >= 0.60)?"verified":"needs_review",
      };
    })).select("id,question_number");
    if (questionError) throw questionError;
    const questionTexts=numbered.map(question=>cleanQuestionText(question.text));
    const questionEmbeddings=await generateDocumentEmbeddings(questionTexts);
    await client.from("resource_chunks").delete().eq("resource_id",resource.id).eq("chunk_type","question");
    await client.from("resource_chunks").insert(numbered.map((question,index)=>{
      const tag=classified.get(question.number),saved=savedQuestions?.find(row=>row.question_number===question.number);
      return {resource_id:resource.id,subject_id:resource.subject_id,level:resource.level,board:resource.board||resource.subjects?.board,year:resource.year,session:resource.session,paper_code:resource.paper_code,variant:resource.variant,chunk_type:"question",question_number:question.number,title:`Question ${question.number}`,content:questionTexts[index],extracted_text:questionTexts[index],topic:tag?.topic??"Unclassified",subtopic:tag?.subtopic??null,marks:question.marks,difficulty:tag?.difficulty??"MEDIUM",embedding:`[${questionEmbeddings[index]!.join(",")}]`,source_reference:`${resource.original_filename}#question-${question.number}`,metadata_json:{questionId:saved?.id??null,confidence:tag?.confidence??0,needsReview:tag?.needsReview??true}};
    }));
    await client.from("topic_tagging_audits").delete().eq("source_type","question").in("source_id",(savedQuestions??[]).map(q=>q.id));
    if(savedQuestions?.length) await client.from("topic_tagging_audits").insert(savedQuestions.map(question=>{
      const tag=classified.get(question.question_number);
      return {source_type:"question",source_id:question.id,resource_id:resource.id,question_id:question.id,predicted_topic:tag?.topic??"Unclassified",predicted_subtopic:tag?.subtopic??null,new_topic:tag?.topic??"Unclassified",new_subtopic:tag?.subtopic??null,confidence:tag?.confidence??0,needs_review:tag?.needsReview??true,review_status:tag&&!tag.needsReview&&tag.confidence>=0.60?"verified":"needs_review",raw_model_output:{method:tag?.method??"missing_map",note:tag?.note??null}};
    }));
    await onStep?.("rendering_pages",75);
    try {
      if (screenshotMode() !== "pre_generate") {
        await client.from("question_index").update({ screenshot_status: "not_generated" }).eq("resource_id", resource.id);
      } else {
      const screenshotResult = await createAndStoreQuestionScreenshots(client, resource, Buffer.from(await file.arrayBuffer()), savedQuestions ?? []);
      if (screenshotResult.needsReview) classificationWarning = [classificationWarning, `${screenshotResult.needsReview} question screenshots need crop review.`].filter(Boolean).join(" ");
      }
    } catch (error) {
      await client.from("question_index").update({ screenshot_status: "failed" }).eq("resource_id", resource.id);
      classificationWarning = [classificationWarning, `Question screenshots failed without blocking indexing: ${error instanceof Error ? error.message : "unknown renderer error"}`].filter(Boolean).join(" ");
    }
    indexedQuestions = numbered.length;
    if (resource.resource_type === "PAST_PAPER") {
      await onStep?.("linking_marking_scheme",85);
      const { data: schemes, error: schemeError } = await client.from("resources").select("id,extracted_text")
        .eq("resource_type", "MARKING_SCHEME").eq("related_resource_id", resource.id).not("extracted_text", "is", null);
      if (schemeError) throw schemeError;
      for (const scheme of schemes ?? []) linkedAnswers += await linkAnswerRows(client, resource.id, Number(scheme.id), extractMarkingSchemeAnswers(scheme.extracted_text));
    }
  }

  if (resource.resource_type === "MARKING_SCHEME" && numbered.length) {
    await onStep?.("linking_marking_scheme",85);
    const paperResourceId = await resolveQuestionPaper(client, resource);
    if (!paperResourceId) classificationWarning = "Marking scheme processed but not linked yet. Upload a past paper with the same subject, level, year, session, paper code, and variant.";
    else linkedAnswers += await linkAnswerRows(client, paperResourceId, resource.id, extractMarkingSchemeAnswers(extractedText));
  }

  await onStep?.("updating_analytics",95);
  return { extractedText, chunks: chunks.length, embeddings: embeddings.length, indexedQuestions, linkedAnswers, classificationWarning };
}
