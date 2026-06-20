import { Router, type IRouter } from "express";
import { db, activityTable, subjectsTable } from "../db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();
const DEMO_USER_ID = 1;

router.get("/activity", async (req, res): Promise<void> => {
  const activities = await db.select().from(activityTable)
    .where(eq(activityTable.userId, DEMO_USER_ID))
    .orderBy(desc(activityTable.createdAt))
    .limit(20);

  const subjects = await db.select().from(subjectsTable);
  const subjectMap = new Map(subjects.map(s => [s.id, s]));

  res.json(activities.map(a => ({
    id: a.id,
    type: a.type,
    subjectId: a.subjectId,
    subjectName: subjectMap.get(a.subjectId)?.name ?? "Unknown",
    subjectColor: subjectMap.get(a.subjectId)?.color ?? "#6D28D9",
    description: a.description,
    createdAt: a.createdAt.toISOString(),
  })));
});

export default router;
