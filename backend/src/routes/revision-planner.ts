import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth";
import { aiLimiter } from "../middleware/rate-limit";
import { buildRevisionPlan, enrichRevisionPlanWithAi } from "../services/revision-planner";

const router: IRouter = Router();

const RequestBody = z.object({
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the exam date as YYYY-MM-DD."),
  subjects: z.array(z.string().trim().min(1).max(120)).min(1, "Add at least one subject.").max(15),
  weakTopics: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  hoursPerDay: z.coerce.number().min(0.5).max(12).optional(),
  studyDaysPerWeek: z.coerce.number().int().min(1).max(7).optional(),
  preparationLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  includeGuidance: z.boolean().optional().default(true),
});

router.post("/revision-plan", requireUser, aiLimiter, async (req, res): Promise<void> => {
  const parsed = RequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid revision plan request." });
    return;
  }

  try {
    const plan = buildRevisionPlan(parsed.data);
    const result = parsed.data.includeGuidance ? await enrichRevisionPlanWithAi(plan) : plan;
    res.json(result);
  } catch (error) {
    // buildRevisionPlan throws user-facing validation messages (past date, no subjects).
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not build a revision plan." });
  }
});

export default router;
