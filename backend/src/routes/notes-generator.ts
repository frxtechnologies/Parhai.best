import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth";
import { aiLimiter } from "../middleware/rate-limit";
import { getAiConfigurationError, isAiConfigured } from "../lib/ai-service";
import { generateNotes, NOTE_TYPES } from "../services/notes-generator";

const router: IRouter = Router();

const RequestBody = z.object({
  subjectId: z.coerce.number().int().positive(),
  topic: z.string().trim().min(1).max(160),
  noteType: z.enum(NOTE_TYPES),
});

router.post("/generate-notes", requireUser, aiLimiter, async (req, res): Promise<void> => {
  if (!isAiConfigured()) {
    res.status(503).json({ error: getAiConfigurationError() });
    return;
  }
  const parsed = RequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid notes request." });
    return;
  }
  try {
    const notes = await generateNotes(res.locals.supabase, parsed.data);
    res.json(notes);
  } catch (error) {
    req.log.error({ error }, "Notes generation failed");
    const message = error instanceof Error ? error.message : "Could not generate notes.";
    res.status(/not found|Enter a topic/.test(message) ? 400 : 502).json({ error: message });
  }
});

export default router;
