import { Router, type IRouter } from "express";
import multer from "multer";
import { requireUser } from "../middleware/auth";
import { aiLimiter } from "../middleware/rate-limit";
import { getVisionConfigurationError, isVisionConfigured, providerSupportsPdf, type VisionInput } from "../lib/ai-service";
import { solveQuestionFromImages } from "../services/question-solver";

const router: IRouter = Router();

const ACCEPTED = /^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf)$/i;

const upload = multer({
  storage: multer.memoryStorage(), // in-memory only: uploaded questions are never persisted
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => callback(null, ACCEPTED.test(file.mimetype)),
});

router.post("/solve-question", requireUser, aiLimiter, upload.array("images", 5), async (req, res): Promise<void> => {
  if (!isVisionConfigured()) {
    res.status(503).json({ error: getVisionConfigurationError() });
    return;
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: "Upload an image or PDF of the question." });
    return;
  }

  const hasPdf = files.some((file) => file.mimetype.toLowerCase() === "application/pdf");
  if (hasPdf && !providerSupportsPdf()) {
    res.status(400).json({ error: "PDF questions need AI_PROVIDER=gemini. Please upload a photo or screenshot instead." });
    return;
  }

  const hintSubjectId = req.body.subjectId ? Number(req.body.subjectId) : null;
  const images: VisionInput[] = files.map((file) => ({ data: file.buffer.toString("base64"), mimeType: file.mimetype }));

  try {
    const result = await solveQuestionFromImages(res.locals.supabase, images, Number.isFinite(hintSubjectId) ? hintSubjectId : null);
    res.json(result);
  } catch (error) {
    req.log.error({ error }, "Question solve failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not solve the question." });
  }
});

export default router;
