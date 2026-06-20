import { Router, type IRouter } from "express";
import { db, examsTable, subjectsTable } from "../db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ListParams = z.object({ subjectId: z.coerce.number().optional() });

router.get("/exams", async (req, res): Promise<void> => {
  const parsed = ListParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const exams = parsed.data.subjectId
    ? await db.select().from(examsTable).where(eq(examsTable.subjectId, parsed.data.subjectId)).orderBy(asc(examsTable.examDate))
    : await db.select().from(examsTable).orderBy(asc(examsTable.examDate));

  const subjects = await db.select().from(subjectsTable);
  const subjectMap = new Map(subjects.map(s => [s.id, s]));
  const now = new Date();

  res.json(exams.map(e => ({
    id: e.id,
    subjectId: e.subjectId,
    subjectName: subjectMap.get(e.subjectId)?.name ?? "Unknown",
    subjectColor: subjectMap.get(e.subjectId)?.color ?? "#6D28D9",
    session: e.session,
    year: e.year,
    examDate: e.examDate,
    paperNumber: e.paperNumber,
    daysUntil: Math.ceil((new Date(e.examDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  })));
});

export default router;
