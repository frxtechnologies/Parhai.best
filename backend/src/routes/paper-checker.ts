import { Router, type IRouter } from "express";
import multer from "multer";
import { requireUser } from "../middleware/auth";
import { aiLimiter } from "../middleware/rate-limit";
import { getVisionConfigurationError, isVisionConfigured, providerSupportsPdf, type VisionInput } from "../lib/ai-service";
import { checkPaperFromImages } from "../services/paper-checker";

const router: IRouter = Router();

const ACCEPTED = /^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf)$/i;

const upload = multer({
  storage: multer.memoryStorage(), // in-memory only: answer sheets are never persisted (privacy requirement)
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) => callback(null, ACCEPTED.test(file.mimetype)),
});

router.post("/check-paper", requireUser, aiLimiter, upload.array("pages", 20), async (req, res): Promise<void> => {
  if (!isVisionConfigured()) {
    res.status(503).json({ error: getVisionConfigurationError() });
    return;
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: "Upload the completed answer sheet (image or PDF pages)." });
    return;
  }

  if (files.some((file) => file.mimetype.toLowerCase() === "application/pdf") && !providerSupportsPdf()) {
    res.status(400).json({ error: "PDF answer sheets need AI_PROVIDER=gemini. Please upload page photos instead." });
    return;
  }

  const hintSubjectId = req.body.subjectId ? Number(req.body.subjectId) : null;
  const images: VisionInput[] = files.map((file) => ({ data: file.buffer.toString("base64"), mimeType: file.mimetype }));

  try {
    const report = await checkPaperFromImages(res.locals.supabase, images, Number.isFinite(hintSubjectId) ? hintSubjectId : null);
    res.json(report);
    // Buffers are released with the request; nothing is written to storage.
  } catch (error) {
    req.log.error({ error }, "Paper check failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not check the paper." });
  }
});

export default router;
