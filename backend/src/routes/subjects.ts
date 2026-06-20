import { Router, type IRouter } from "express";
import { db, subjectsTable, papersTable, notesTable, questionsTable } from "../db";
import { eq, count } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ListParams = z.object({ level: z.enum(["O_LEVEL", "A_LEVEL"]).optional() });

router.get("/subjects", async (req, res): Promise<void> => {
  const parsed = ListParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const subjects = parsed.data.level
    ? await db.select().from(subjectsTable).where(eq(subjectsTable.level, parsed.data.level))
    : await db.select().from(subjectsTable);

  const result = await Promise.all(subjects.map(async (s) => {
    const [paperCount] = await db.select({ count: count() }).from(papersTable).where(eq(papersTable.subjectId, s.id));
    const [noteCount] = await db.select({ count: count() }).from(notesTable).where(eq(notesTable.subjectId, s.id));
    const [questionCount] = await db.select({ count: count() }).from(questionsTable).where(eq(questionsTable.subjectId, s.id));
    return {
      ...s,
      totalPapers: Number(paperCount.count),
      totalNotes: Number(noteCount.count),
      totalQuestions: Number(questionCount.count),
    };
  }));

  res.json(result);
});

router.get("/subjects/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid subject id" }); return; }

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, id));
  if (!subject) { res.status(404).json({ error: "Subject not found" }); return; }

  const [paperCount] = await db.select({ count: count() }).from(papersTable).where(eq(papersTable.subjectId, subject.id));
  const [noteCount] = await db.select({ count: count() }).from(notesTable).where(eq(notesTable.subjectId, subject.id));
  const [questionCount] = await db.select({ count: count() }).from(questionsTable).where(eq(questionsTable.subjectId, subject.id));

  res.json({
    ...subject,
    totalPapers: Number(paperCount.count),
    totalNotes: Number(noteCount.count),
    totalQuestions: Number(questionCount.count),
  });
});

export default router;
