import { Router, type IRouter } from "express";
import { db, questionsTable, subjectsTable } from "../db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ListParams = z.object({
  subjectId: z.coerce.number().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  topic: z.string().optional(),
});

router.get("/questions", async (req, res): Promise<void> => {
  const parsed = ListParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const conditions = [];
  if (parsed.data.subjectId) conditions.push(eq(questionsTable.subjectId, parsed.data.subjectId));
  if (parsed.data.difficulty) conditions.push(eq(questionsTable.difficulty, parsed.data.difficulty));
  if (parsed.data.topic) conditions.push(eq(questionsTable.topic, parsed.data.topic));

  const questions = conditions.length > 0
    ? await db.select().from(questionsTable).where(and(...conditions))
    : await db.select().from(questionsTable);

  const subjects = await db.select().from(subjectsTable);
  const subjectMap = new Map(subjects.map(s => [s.id, s]));

  res.json(questions.map(q => ({
    ...q,
    subjectName: subjectMap.get(q.subjectId)?.name ?? "Unknown",
    year: q.year ?? null,
  })));
});

router.get("/questions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, question.subjectId));
  res.json({ ...question, subjectName: subject?.name ?? "Unknown", year: question.year ?? null });
});

export default router;
