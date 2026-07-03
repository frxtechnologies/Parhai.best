import { Router, type IRouter } from "express";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "../middleware/auth";
import {
  PaperAnalyzerAgent,
  RepeatedTopicsAgent,
  RevisionPlannerAgent,
} from "../services/study-agents";

const router: IRouter = Router();
router.get(
  "/agents/paper-analyzer/:resourceId",
  requireUser,
  async (req, res) => {
    try {
      res.json(
        await new PaperAnalyzerAgent(
          res.locals.supabase as SupabaseClient,
        ).analyze(Number(req.params.resourceId)),
      );
    } catch (error) {
      res
        .status(422)
        .json({
          error:
            error instanceof Error ? error.message : "Paper analysis failed.",
        });
    }
  },
);
const repeatedSchema = z.object({
  subject_id: z.coerce.number().int().positive(),
  level: z.string().min(1),
  syllabus_code: z.string().min(1),
  year_from: z.coerce.number().int(),
  year_to: z.coerce.number().int(),
  paper_number: z.coerce.number().int().positive().optional(),
  variant: z.coerce.number().int().positive().optional(),
  session: z.string().optional(),
});
router.get("/agents/repeated-topics", requireUser, async (req, res) => {
  const parsed = repeatedSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }
  const x = parsed.data;
  try {
    res.json(
      await new RepeatedTopicsAgent(
        res.locals.supabase as SupabaseClient,
      ).calculate({
        subjectId: x.subject_id,
        level: x.level,
        syllabusCode: x.syllabus_code,
        yearFrom: x.year_from,
        yearTo: x.year_to,
        paperNumber: x.paper_number,
        variant: x.variant,
        session: x.session,
      }),
    );
  } catch (error) {
    res
      .status(422)
      .json({
        error:
          error instanceof Error ? error.message : "Topic analysis failed.",
      });
  }
});
const plannerSchema = z.object({
  subjectId: z.number().int().positive(),
  level: z.string(),
  syllabusCode: z.string(),
  currentGrade: z.string().optional(),
  targetGrade: z.string(),
  examDate: z.string(),
  hoursPerDay: z.number().positive().max(12),
  planLengthDays: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(30),
    z.literal(90),
  ]),
  weakTopics: z.array(z.string()).default([]),
  preferredStyle: z.string().optional(),
});
router.post("/agents/revision-planner", requireUser, async (req, res) => {
  const parsed = plannerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }
  try {
    res
      .status(201)
      .json(
        await new RevisionPlannerAgent(
          res.locals.supabase as SupabaseClient,
        ).generate(parsed.data, res.locals.user.id),
      );
  } catch (error) {
    res
      .status(422)
      .json({
        error: error instanceof Error ? error.message : "Revision plan failed.",
      });
  }
});
router.get("/agents/revision-plans", requireUser, async (_req, res) => {
  const { data, error } = await (res.locals.supabase as SupabaseClient)
    .from("revision_plans")
    .select(
      "id,subject_id,target_grade,exam_date,hours_per_day,plan_length_days,weak_topics,plan_json,created_at",
    )
    .eq("user_id", res.locals.user.id)
    .order("created_at", { ascending: false });
  if (error) {
    res.status(422).json({ error: error.message });
    return;
  }
  res.json(data ?? []);
});
export default router;
