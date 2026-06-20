import { Router, type IRouter } from "express";
import { db, papersTable, subjectsTable } from "../db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ListParams = z.object({
  subjectId: z.coerce.number().optional(),
  type: z.enum(["PAST_PAPER", "MARKING_SCHEME"]).optional(),
  year: z.coerce.number().optional(),
});

router.get("/papers", async (req, res): Promise<void> => {
  const parsed = ListParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const conditions = [];
  if (parsed.data.subjectId) conditions.push(eq(papersTable.subjectId, parsed.data.subjectId));
  if (parsed.data.type) conditions.push(eq(papersTable.type, parsed.data.type));
  if (parsed.data.year) conditions.push(eq(papersTable.year, parsed.data.year));

  const papers = conditions.length > 0
    ? await db.select().from(papersTable).where(and(...conditions))
    : await db.select().from(papersTable);

  const subjects = await db.select().from(subjectsTable);
  const subjectMap = new Map(subjects.map(s => [s.id, s]));

  res.json(papers.map(p => ({
    ...p,
    subjectName: subjectMap.get(p.subjectId)?.name ?? "Unknown",
    variant: p.variant ?? null,
    fileUrl: p.fileUrl ?? null,
  })));
});

router.get("/papers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [paper] = await db.select().from(papersTable).where(eq(papersTable.id, id));
  if (!paper) { res.status(404).json({ error: "Paper not found" }); return; }

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, paper.subjectId));
  res.json({ ...paper, subjectName: subject?.name ?? "Unknown", variant: paper.variant ?? null, fileUrl: paper.fileUrl ?? null });
});

export default router;
