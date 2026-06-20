import { Router, type IRouter } from "express";
import { db, progressTable, subjectsTable } from "../db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();
const DEMO_USER_ID = 1;

const UpdateProgressBody = z.object({
  subjectId: z.number(),
  questionsAttempted: z.number().optional(),
  questionsCorrect: z.number().optional(),
  papersCompleted: z.number().optional(),
  notesRead: z.number().optional(),
  hoursStudied: z.number().optional(),
});

router.get("/progress", async (req, res): Promise<void> => {
  const progressRows = await db.select().from(progressTable).where(eq(progressTable.userId, DEMO_USER_ID));
  const subjects = await db.select().from(subjectsTable);
  const subjectMap = new Map(subjects.map(s => [s.id, s]));

  res.json(progressRows.map(p => {
    const subject = subjectMap.get(p.subjectId);
    const totalAttempts = p.questionsAttempted || 1;
    return {
      subjectId: p.subjectId,
      subjectName: subject?.name ?? "Unknown",
      subjectColor: subject?.color ?? "#6D28D9",
      questionsAttempted: p.questionsAttempted,
      questionsCorrect: p.questionsCorrect,
      papersCompleted: p.papersCompleted,
      notesRead: p.notesRead,
      hoursStudied: p.hoursStudied,
      percentComplete: Math.round((p.questionsCorrect / totalAttempts) * 100),
      lastStudied: p.lastStudied ? p.lastStudied.toISOString() : null,
    };
  }));
});

router.post("/progress", async (req, res): Promise<void> => {
  const parsed = UpdateProgressBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(progressTable)
    .where(and(eq(progressTable.userId, DEMO_USER_ID), eq(progressTable.subjectId, parsed.data.subjectId)));

  let updated;
  if (existing) {
    const [row] = await db.update(progressTable).set({
      questionsAttempted: existing.questionsAttempted + (parsed.data.questionsAttempted ?? 0),
      questionsCorrect: existing.questionsCorrect + (parsed.data.questionsCorrect ?? 0),
      papersCompleted: existing.papersCompleted + (parsed.data.papersCompleted ?? 0),
      notesRead: existing.notesRead + (parsed.data.notesRead ?? 0),
      hoursStudied: existing.hoursStudied + (parsed.data.hoursStudied ?? 0),
      lastStudied: new Date(),
    }).where(eq(progressTable.id, existing.id)).returning();
    updated = row;
  } else {
    const [row] = await db.insert(progressTable).values({
      userId: DEMO_USER_ID,
      subjectId: parsed.data.subjectId,
      questionsAttempted: parsed.data.questionsAttempted ?? 0,
      questionsCorrect: parsed.data.questionsCorrect ?? 0,
      papersCompleted: parsed.data.papersCompleted ?? 0,
      notesRead: parsed.data.notesRead ?? 0,
      hoursStudied: parsed.data.hoursStudied ?? 0,
      lastStudied: new Date(),
    }).returning();
    updated = row;
  }

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, updated.subjectId));
  const totalAttempts = updated.questionsAttempted || 1;

  res.json({
    subjectId: updated.subjectId,
    subjectName: subject?.name ?? "Unknown",
    subjectColor: subject?.color ?? "#6D28D9",
    questionsAttempted: updated.questionsAttempted,
    questionsCorrect: updated.questionsCorrect,
    papersCompleted: updated.papersCompleted,
    notesRead: updated.notesRead,
    hoursStudied: updated.hoursStudied,
    percentComplete: Math.round((updated.questionsCorrect / totalAttempts) * 100),
    lastStudied: updated.lastStudied ? updated.lastStudied.toISOString() : null,
  });
});

export default router;
