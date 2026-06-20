import { Router, type IRouter } from "express";
import { db, usersTable, progressTable, activityTable, examsTable, subjectsTable } from "../db";
import { eq, desc, asc } from "drizzle-orm";

const router: IRouter = Router();
const DEMO_USER_ID = 1;

router.get("/dashboard", async (req, res): Promise<void> => {
  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, DEMO_USER_ID));

  if (!user) {
    const [newUser] = await db.insert(usersTable).values({
      googleId: "demo-google-id",
      name: "Ahmed Khan",
      email: "ahmed@parhai.com",
      avatarUrl: null,
      level: "O_LEVEL",
      subjectIds: ["1", "2", "3"],
      onboarded: true,
      streakDays: 7,
    }).returning();
    user = newUser;
  }

  const [progressRows, subjects, activities, upcomingExams] = await Promise.all([
    db.select().from(progressTable).where(eq(progressTable.userId, DEMO_USER_ID)),
    db.select().from(subjectsTable),
    db.select().from(activityTable).where(eq(activityTable.userId, DEMO_USER_ID)).orderBy(desc(activityTable.createdAt)).limit(10),
    db.select().from(examsTable).orderBy(asc(examsTable.examDate)).limit(5),
  ]);

  const subjectMap = new Map(subjects.map(s => [s.id, s]));
  const now = new Date();

  const totalHoursStudied = progressRows.reduce((sum, p) => sum + p.hoursStudied, 0);
  const totalQuestionsAttempted = progressRows.reduce((sum, p) => sum + p.questionsAttempted, 0);
  const totalCorrect = progressRows.reduce((sum, p) => sum + p.questionsCorrect, 0);
  const overallScore = totalQuestionsAttempted > 0 ? Math.round((totalCorrect / totalQuestionsAttempted) * 100) : 0;

  const userEnrolledSubjectIds = user.subjectIds.map(Number);

  res.json({
    user: {
      id: user.id,
      googleId: user.googleId,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      level: user.level ?? null,
      subjectIds: userEnrolledSubjectIds,
      onboarded: user.onboarded,
      streakDays: user.streakDays,
      createdAt: user.createdAt.toISOString(),
    },
    streakDays: user.streakDays,
    totalHoursStudied: Math.round(totalHoursStudied * 10) / 10,
    subjectsEnrolled: userEnrolledSubjectIds.length,
    questionsAttempted: totalQuestionsAttempted,
    overallScore,
    subjectProgress: progressRows.map(p => {
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
    }),
    recentActivity: activities.map(a => ({
      id: a.id,
      type: a.type,
      subjectId: a.subjectId,
      subjectName: subjectMap.get(a.subjectId)?.name ?? "Unknown",
      subjectColor: subjectMap.get(a.subjectId)?.color ?? "#6D28D9",
      description: a.description,
      createdAt: a.createdAt.toISOString(),
    })),
    upcomingExams: upcomingExams.map(e => ({
      id: e.id,
      subjectId: e.subjectId,
      subjectName: subjectMap.get(e.subjectId)?.name ?? "Unknown",
      subjectColor: subjectMap.get(e.subjectId)?.color ?? "#6D28D9",
      session: e.session,
      year: e.year,
      examDate: e.examDate,
      paperNumber: e.paperNumber,
      daysUntil: Math.ceil((new Date(e.examDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    })),
  });
});

export default router;
