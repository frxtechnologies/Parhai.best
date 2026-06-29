import type { SupabaseClient } from "@supabase/supabase-js";

export type QuestionCrop = {
  questionNumber: string;
  pageNumber: number;
  bbox: { x: number; y: number; width: number; height: number };
  needsReview: boolean;
  part: number;
};

type ResourceScope = {
  id: number;
  subject_id?: number;
  level: string;
  year: number | null;
  session: string | null;
  paper_code: string | null;
  variant: number | null;
  subjects: { code: string } | null;
};
export type ScreenshotQuestion = { id: number; question_number: string };
export type ScreenshotMode = "off" | "pre_generate" | "on_demand" | "hybrid_cache";

export function screenshotMode(): ScreenshotMode {
  const mode = process.env.SCREENSHOT_MODE;
  return mode === "off" || mode === "pre_generate" || mode === "hybrid_cache" ? mode : "on_demand";
}

export function screenshotsEnabled() {
  return screenshotMode() !== "off";
}

type Line = { text: string; y: number; height: number };
type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<any>;
  destroy(): Promise<void>;
};
// Cambridge structured papers commonly start a question with either `1.`,
// `1 (a)`, or simply `1 A student...`. The lookahead keeps bare page numbers
// and footer numbers from matching unless question text follows on that line.
const questionPattern = /^(?:question\s+|q\s*)?(\d{1,2})(?:\s*(?:[.):\-]|\([a-z]\))\s+|(?=\s+[A-Za-z([]))/i;

function safeSegment(value: unknown, fallback: string) {
  return String(value ?? fallback).replace(/[^a-z0-9_-]+/gi, "-");
}

async function pageLines(document: PdfDocument, pageNumber: number) {
  const page = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const lines = new Map<number, Line>();
  for (const raw of content.items) {
    if (!("str" in raw) || !raw.str.trim()) continue;
    const y = Math.round(viewport.height - raw.transform[5]);
    const key = Math.round(y / 3) * 3;
    const current = lines.get(key);
    const text = raw.str.trim();
    if (current) current.text += ` ${text}`;
    else lines.set(key, { text, y, height: Math.max(Number(raw.height) || 10, 10) });
  }
  return { viewport, lines: [...lines.values()].sort((a, b) => a.y - b.y) };
}

export async function detectQuestionCrops(buffer: Buffer, questionNumbers: string[]) {
  if (!screenshotsEnabled()) {
    return { crops: [], detected: new Set<string>() };
  }
  const pdfRendererModule = "pdfjs-dist/legacy/build/pdf.mjs";
  const { getDocument } = await import(pdfRendererModule);
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const wanted = new Set(questionNumbers.map((number) => number.match(/^\d+/)?.[0]).filter(Boolean));
  const starts: Array<{ questionNumber: string; pageNumber: number; y: number; pageHeight: number; pageWidth: number }> = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const { viewport, lines } = await pageLines(document, pageNumber);
    for (const line of lines) {
      const match = line.text.match(questionPattern);
      if (match?.[1] && wanted.has(String(Number(match[1])))) {
        const questionNumber = questionNumbers.find((number) => number.match(/^\d+/)?.[0] === String(Number(match[1]))) ?? String(Number(match[1]));
        if (!starts.some((start) => start.questionNumber === questionNumber)) {
          starts.push({ questionNumber, pageNumber, y: Math.max(0, line.y - 16), pageHeight: viewport.height, pageWidth: viewport.width });
        }
      }
    }
  }

  const crops: QuestionCrop[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]!;
    const next = starts[index + 1];
    const endPage = next ? next.pageNumber : start.pageNumber;
    for (let pageNumber = start.pageNumber; pageNumber <= endPage; pageNumber += 1) {
      const { viewport } = await pageLines(document, pageNumber);
      const top = pageNumber === start.pageNumber ? start.y : 0;
      const bottom = next && pageNumber === next.pageNumber ? Math.max(top + 40, next.y - 10) : viewport.height;
      crops.push({
        questionNumber: start.questionNumber,
        pageNumber,
        bbox: { x: 0, y: top, width: viewport.width, height: Math.max(40, bottom - top) },
        needsReview: false,
        part: pageNumber - start.pageNumber + 1,
      });
    }
  }
  await document.destroy();
  return { crops, detected: new Set(starts.map((start) => start.questionNumber)) };
}

export async function createAndStoreQuestionScreenshots(
  client: SupabaseClient,
  resource: ResourceScope,
  buffer: Buffer,
  questions: ScreenshotQuestion[],
) {
  if (!screenshotsEnabled() || !["pre_generate", "hybrid_cache"].includes(screenshotMode())) {
    if (questions.length) {
      const { error } = await client.from("question_index")
        .update({ screenshot_status: "not_generated", updated_at: new Date().toISOString() })
        .eq("resource_id", resource.id);
      if (error) throw error;
    }
    return { screenshots: 0, needsReview: 0, status: "not_generated" as const };
  }

  // Keep the native canvas package outside the module graph used by Netlify's
  // queue bundle. It is resolved at runtime only when screenshots are enabled.
  const nativeCanvasModule = "@napi-rs/canvas";
  const { createCanvas } = await import(nativeCanvasModule);
  const pdfRendererModule = "pdfjs-dist/legacy/build/pdf.mjs";
  const { getDocument } = await import(pdfRendererModule);
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const detection = await detectQuestionCrops(buffer, questions.map((question) => question.question_number));
  const rows: Array<Record<string, unknown>> = [];
  const bucket = "question-screenshots";

  let failed = 0;
  for (const question of questions) {
    try {
    let crops = detection.crops.filter((crop) => crop.questionNumber === question.question_number);
    if (!crops.length) {
      const page = Math.min(Math.max(1, Number(question.question_number.match(/^\d+/)?.[0]) || 1), document.numPages);
      const pdfPage = await document.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 1 });
      crops = [{ questionNumber: question.question_number, pageNumber: page, bbox: { x: 0, y: 0, width: viewport.width, height: viewport.height }, needsReview: true, part: 1 }];
    }

    for (const crop of crops) {
      const page = await document.getPage(crop.pageNumber);
      const scale = 1.6;
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d") as never, viewport, canvas: canvas as never }).promise;
      const box = {
        x: Math.max(0, Math.floor(crop.bbox.x * scale)),
        y: Math.max(0, Math.floor(crop.bbox.y * scale)),
        width: Math.min(canvas.width, Math.ceil(crop.bbox.width * scale)),
        height: Math.min(canvas.height - Math.floor(crop.bbox.y * scale), Math.ceil(crop.bbox.height * scale)),
      };
      const output = createCanvas(box.width, box.height);
      output.getContext("2d").drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      const suffix = crops.length > 1 ? `-part-${crop.part}` : "";
      const path = [
        safeSegment(resource.level, "unknown-level").replace(/_/g, "-"),
        safeSegment(resource.subjects?.code, "unknown-subject"),
        safeSegment(resource.year, "general"),
        safeSegment(resource.session, "general"),
        `paper-${safeSegment(resource.paper_code, "unknown")}`,
        `variant-${safeSegment(resource.variant, "unknown")}`,
        `q-${safeSegment(question.question_number, "unknown")}${suffix}.png`,
      ].join("/");
      const { error: uploadError } = await client.storage.from(bucket).upload(path, output.toBuffer("image/png"), { contentType: "image/png", upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = client.storage.from(bucket).getPublicUrl(path);
      rows.push({
        question_id: question.id,
        resource_id: resource.id,
        image_path: path,
        image_url: publicUrl.publicUrl,
        page_number: crop.pageNumber,
        bbox: crop.bbox,
        image_order: crop.part,
        needs_review: crop.needsReview,
      });
    }
    } catch {
      failed += 1;
      await client.from("question_index").update({
        screenshot_status: "failed",
        updated_at: new Date().toISOString(),
      }).eq("id", question.id);
    }
  }
  await document.destroy();

  const questionIds = questions.map((question) => question.id);
  const { error: clearError } = await client.from("question_images").delete().in("question_id", questionIds);
  if (clearError) throw clearError;
  if (rows.length) {
    const { error: insertError } = await client.from("question_images").insert(rows);
    if (insertError) throw insertError;
  }
  return {
    screenshots: rows.length,
    generated: rows.filter((row) => !row.needs_review).length,
    fullPageFallbacks: rows.filter((row) => row.needs_review).length,
    failed,
    needsReview: rows.filter((row) => row.needs_review).length,
  };
}

type Bbox = { x: number; y: number; width: number; height: number };

function validBox(value: unknown): value is Bbox {
  if (!value || typeof value !== "object") return false;
  const box = value as Partial<Bbox>;
  return [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && Number(box.width) > 10 && Number(box.height) > 10;
}

export async function renderQuestionPreview(client: SupabaseClient, questionId: number) {
  if (!screenshotsEnabled()) throw new Error("Question previews are disabled.");
  const { data: question, error } = await client.from("question_index")
    .select("id,resource_id,question_number,source_page,bbox,screenshot_status,question_screenshot_url,question_screenshot_path,resources!inner(bucket,storage_path)")
    .eq("id", questionId).single();
  if (error || !question) throw new Error(error?.message ?? "Question not found.");

  const mode = screenshotMode();
  if (mode === "hybrid_cache" && question.question_screenshot_path) {
    const { data, error: cachedError } = await client.storage.from("question-screenshots").download(question.question_screenshot_path);
    if (!cachedError && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      return {
        buffer, status: "generated" as const, cached: true,
        pageNumber: question.source_page ?? 1, bbox: validBox(question.bbox) ? question.bbox : null,
        outputSize: buffer.length, nonBlankRatio: null, resourcePath: "hybrid-cache",
      };
    }
  }

  const resource = Array.isArray(question.resources) ? question.resources[0] : question.resources;
  if (!resource) throw new Error("Question source PDF is missing.");
  const { data: pdfFile, error: downloadError } = await client.storage.from(resource.bucket).download(resource.storage_path);
  if (downloadError || !pdfFile) throw new Error(downloadError?.message ?? "Could not download source PDF.");

  const nativeCanvasModule = "@napi-rs/canvas";
  const { createCanvas } = await import(nativeCanvasModule);
  const pdfRendererModule = "pdfjs-dist/legacy/build/pdf.mjs";
  const { getDocument } = await import(pdfRendererModule);
  const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
  let inferredCrop: QuestionCrop | null = null;
  const metadataNeedsDetection = !question.source_page
    || question.screenshot_status === "full_page_fallback"
    || question.screenshot_status === "failed";
  if (metadataNeedsDetection) {
    const detection = await detectQuestionCrops(pdfBuffer, [question.question_number]);
    inferredCrop = detection.crops[0] ?? null;
  }
  if (metadataNeedsDetection && !inferredCrop && !question.source_page) {
    await client.from("question_index").update({ screenshot_status: "failed", updated_at: new Date().toISOString() }).eq("id", question.id);
    throw new Error("Preview crop failed: source_page is missing and the question heading was not found.");
  }
  const document = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const scale = 1.6;
  const resolvedBox = inferredCrop?.bbox ?? (validBox(question.bbox) ? question.bbox : null);
  const exact = validBox(resolvedBox);
  const requestedPage = Math.min(Math.max(1, inferredCrop?.pageNumber ?? question.source_page ?? 1), document.numPages);
  const attempts = [
    { page: requestedPage, box: exact ? resolvedBox as Bbox : null, fallback: !exact },
    ...(exact ? [{ page: requestedPage, box: null, fallback: true }] : []),
    { page: requestedPage - 1, box: null, fallback: true },
    { page: requestedPage + 1, box: null, fallback: true },
  ].filter((attempt, index, all) => attempt.page >= 1 && attempt.page <= document.numPages
    && all.findIndex((candidate) => candidate.page === attempt.page && Boolean(candidate.box) === Boolean(attempt.box)) === index);

  let buffer: Buffer | null = null;
  let pageNumber = requestedPage;
  let usedBox: Bbox | null = null;
  let status: "generated" | "full_page_fallback" = "full_page_fallback";
  let nonBlankRatio = 0;
  let rejectedInstructionPages = 0;
  for (const attempt of attempts) {
    const page = await document.getPage(attempt.page);
    const pageContent = await page.getTextContent();
    const pageText = pageContent.items.map((item: any) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").toLowerCase();
    const instructionSignals = [
      "instructions", "information", "you must answer on the question paper",
      "answer all questions", "use a black or dark blue pen", "write your name",
    ].filter((signal) => pageText.includes(signal)).length;
    if (instructionSignals >= 2 || /\bblank page\b/.test(pageText)) {
      rejectedInstructionPages += 1;
      continue;
    }
    const viewport = page.getViewport({ scale });
    const pageCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: pageCanvas.getContext("2d") as never, viewport, canvas: pageCanvas as never }).promise;
    const sourceBox = attempt.box ?? { x: 0, y: 0, width: viewport.width / scale, height: viewport.height / scale };
    const x = Math.max(0, Math.floor(sourceBox.x * scale));
    const y = Math.max(0, Math.floor(sourceBox.y * scale));
    const width = Math.min(pageCanvas.width - x, Math.ceil(sourceBox.width * scale));
    const height = Math.min(pageCanvas.height - y, Math.ceil(sourceBox.height * scale));
    if (width < 20 || height < 20) continue;
    const output = createCanvas(width, height);
    const context = output.getContext("2d");
    context.drawImage(pageCanvas, x, y, width, height, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let ink = 0;
    const step = Math.max(4, Math.floor(pixels.length / 160000 / 4) * 4);
    let sampled = 0;
    for (let offset = 0; offset < pixels.length; offset += step) {
      sampled += 1;
      if (pixels[offset] < 242 || pixels[offset + 1] < 242 || pixels[offset + 2] < 242) ink += 1;
    }
    nonBlankRatio = sampled ? ink / sampled : 0;
    if (nonBlankRatio < 0.004) continue;
    buffer = output.toBuffer("image/png");
    pageNumber = attempt.page;
    usedBox = attempt.box;
    status = attempt.fallback ? "full_page_fallback" : "generated";
    break;
  }
  await document.destroy();
  if (!buffer) {
    await client.from("question_index").update({ screenshot_status: rejectedInstructionPages ? "failed_page_match" : "failed", updated_at: new Date().toISOString() }).eq("id", question.id);
    throw new Error("Preview crop failed: source page, crop, and nearby pages were blank.");
  }
  await client.from("question_index").update({
    screenshot_status: status, source_page: pageNumber, bbox: usedBox,
    updated_at: new Date().toISOString(),
  }).eq("id", question.id);

  if (mode === "hybrid_cache") {
    const path = `on-demand/${question.resource_id}/q-${safeSegment(question.question_number, String(question.id))}.png`;
    const { error: uploadError } = await client.storage.from("question-screenshots")
      .upload(path, buffer, { contentType: "image/png", upsert: true, cacheControl: "86400" });
    if (!uploadError) {
      const { data: publicUrl } = client.storage.from("question-screenshots").getPublicUrl(path);
      await client.from("question_index").update({
        question_screenshot_path: path, question_screenshot_url: publicUrl.publicUrl,
        screenshot_status: status, updated_at: new Date().toISOString(),
      }).eq("id", question.id);
    }
  }
  return {
    buffer, status, cached: false, pageNumber, bbox: usedBox,
    outputSize: buffer.length, nonBlankRatio, resourcePath: resource.storage_path,
  };
}

export async function generateScreenshotsForResource(
  client: SupabaseClient,
  resourceId: number,
  questionId?: number,
) {
  const { data: resource, error: resourceError } = await client.from("resources")
    .select("id,subject_id,level,year,session,paper_code,variant,bucket,storage_path")
    .eq("id", resourceId).single();
  if (resourceError || !resource) throw new Error(resourceError?.message ?? "Resource not found.");
  const { data: subject, error: subjectError } = await client.from("subjects")
    .select("code").eq("id", resource.subject_id).single();
  if (subjectError || !subject) throw new Error(subjectError?.message ?? "Subject not found.");
  let query = client.from("question_index").select("id,question_number").eq("resource_id", resourceId);
  if (questionId) query = query.eq("id", questionId);
  const { data: questions, error: questionError } = await query;
  if (questionError) throw questionError;
  if (!questions?.length) throw new Error("No indexed questions found.");
  await client.from("question_index").update({ screenshot_status: "pending" }).in("id", questions.map((q) => q.id));
  const { data: file, error: downloadError } = await client.storage.from(resource.bucket).download(resource.storage_path);
  if (downloadError || !file) throw new Error(downloadError?.message ?? "Could not download source PDF.");
  return createAndStoreQuestionScreenshots(
    client,
    { ...resource, subjects: subject } as unknown as ResourceScope,
    Buffer.from(await file.arrayBuffer()),
    questions,
  );
}
