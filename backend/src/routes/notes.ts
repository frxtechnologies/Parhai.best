import { Router, type IRouter } from "express";
import { db, notesTable, subjectsTable } from "../db";
import { eq, and, like } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ListParams = z.object({
  subjectId: z.coerce.number().optional(),
  topic: z.string().optional(),
});

router.get("/notes", async (req, res): Promise<void> => {
  const parsed = ListParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const conditions = [];
  if (parsed.data.subjectId) conditions.push(eq(notesTable.subjectId, parsed.data.subjectId));
  if (parsed.data.topic) conditions.push(like(notesTable.topic, `%${parsed.data.topic}%`));

  const notes = conditions.length > 0
    ? await db.select().from(notesTable).where(and(...conditions))
    : await db.select().from(notesTable);

  const subjects = await db.select().from(subjectsTable);
  const subjectMap = new Map(subjects.map(s => [s.id, s]));

  res.json(notes.map(n => ({
    ...n,
    subjectName: subjectMap.get(n.subjectId)?.name ?? "Unknown",
    createdAt: n.createdAt.toISOString(),
  })));
});

router.get("/notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [note] = await db.select().from(notesTable).where(eq(notesTable.id, id));
  if (!note) { res.status(404).json({ error: "Note not found" }); return; }

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, note.subjectId));
  res.json({ ...note, subjectName: subject?.name ?? "Unknown", createdAt: note.createdAt.toISOString() });
});

export default router;
