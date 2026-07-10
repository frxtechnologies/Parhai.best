/**
 * Vision-OCR fallback for scanned / image-only PDFs (F11).
 *
 * pdf-parse only reads a PDF's text layer; scanned papers have none, so ingestion
 * used to reject them outright. This rasterizes each page to a PNG and transcribes
 * it with the configured vision model. Page-by-page keeps each response well under
 * the model's output-token limit (a whole-paper transcription would truncate).
 */

import { analyzeImages, getVisionConfigurationError, type VisionInput } from "../lib/ai-service";

const OCR_SYSTEM =
  "You are a precise OCR engine for Cambridge exam papers. Transcribe ALL text from the page faithfully: " +
  "preserve question numbers, sub-parts like (a)(b)(i)(ii), mark cues like [2], equations, symbols, units, and tables. " +
  "Do not solve, summarise, translate, or add commentary. Output plain text only.";

const MAX_OCR_PAGES = Number(process.env.OCR_MAX_PAGES ?? 40);
const RASTER_SCALE = Number(process.env.OCR_RASTER_SCALE ?? 2); // 2x for legibility

/**
 * Heuristic: does this PDF's text layer look scanned/empty (i.e. needs OCR)?
 * Real papers carry 1000s of chars/page in their text layer; scans carry ~none.
 */
export function looksScanned(text: string, numPages: number): boolean {
  const chars = text.replace(/\s+/g, "").length;
  return chars < Math.max(60, (numPages || 1) * 100);
}

/** Render up to `maxPages` PDF pages to PNG images for OCR. */
async function rasterizePdf(buffer: Buffer, maxPages: number): Promise<VisionInput[]> {
  // Keep native/pdfjs modules out of the static graph (Netlify bundling parity).
  const pdfRendererModule = "pdfjs-dist/legacy/build/pdf.mjs";
  const { getDocument } = (await import(pdfRendererModule)) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  const nativeCanvasModule = "@napi-rs/canvas";
  const { createCanvas } = (await import(nativeCanvasModule)) as typeof import("@napi-rs/canvas");

  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const images: VisionInput[] = [];
  try {
    for (let p = 1; p <= pageCount; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: RASTER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d") as never, viewport, canvas: canvas as never }).promise;
      images.push({ data: canvas.toBuffer("image/png").toString("base64"), mimeType: "image/png" });
    }
  } finally {
    await doc.destroy();
  }
  return images;
}

/**
 * OCR a scanned PDF to plain text. Throws a clear error if vision isn't configured
 * or the document can't be rasterized. Best-effort per page: a page that fails to
 * transcribe is skipped rather than failing the whole document.
 */
export async function ocrPdfToText(buffer: Buffer): Promise<string> {
  const visionError = getVisionConfigurationError();
  if (visionError) throw new Error(`This looks like a scanned PDF and needs OCR, but the vision model is unavailable: ${visionError}`);

  const images = await rasterizePdf(buffer, MAX_OCR_PAGES);
  if (images.length === 0) throw new Error("Could not rasterize the PDF for OCR (no pages rendered).");

  const pages: string[] = [];
  for (let i = 0; i < images.length; i++) {
    try {
      const text = await analyzeImages(OCR_SYSTEM, `Transcribe page ${i + 1} of ${images.length} to plain text, in reading order.`, [images[i]!]);
      if (text.trim()) pages.push(text.trim());
    } catch {
      // Skip an unreadable page rather than losing the whole document.
    }
  }
  return pages.join("\n\n").trim();
}
