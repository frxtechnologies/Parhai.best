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
  level: string;
  year: number | null;
  session: string | null;
  paper_code: string | null;
  variant: number | null;
  subjects: { code: string } | null;
};

type Line = { text: string; y: number; height: number };
type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<any>;
  destroy(): Promise<void>;
};
const questionPattern = /^(?:question\s+|q\s*)?(\d{1,2})(?:\s*(?:[.):\-]|\([a-z]\)))\s+/i;

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
  if (process.env.ENABLE_QUESTION_SCREENSHOTS !== "true") {
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
  questions: Array<{ id: number; question_number: string }>,
) {
  if (process.env.ENABLE_QUESTION_SCREENSHOTS !== "true") {
    if (questions.length) {
      const { error } = await client.from("question_index")
        .update({ crop_status: "pending", updated_at: new Date().toISOString() })
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

  for (const question of questions) {
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
  }
  await document.destroy();

  const { error: clearError } = await client.from("question_images").delete().eq("resource_id", resource.id);
  if (clearError) throw clearError;
  if (rows.length) {
    const { error: insertError } = await client.from("question_images").insert(rows);
    if (insertError) throw insertError;
  }
  return { screenshots: rows.length, needsReview: rows.filter((row) => row.needs_review).length };
}
