import { Router, type IRouter } from "express";
import { db, usersTable } from "../db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const DEMO_USER_ID = 1;

const OnboardBody = z.object({
  level: z.enum(["O_LEVEL", "A_LEVEL"]),
  subjectIds: z.array(z.number()),
});

const UpdateProfileBody = z.object({
  name: z.string().optional(),
  level: z.enum(["O_LEVEL", "A_LEVEL"]).optional(),
  subjectIds: z.array(z.number()).optional(),
});

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    googleId: user.googleId,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    level: user.level ?? null,
    subjectIds: user.subjectIds.map(Number),
    onboarded: user.onboarded,
    streakDays: user.streakDays,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/user/profile", async (req, res): Promise<void> => {
  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, DEMO_USER_ID));

  if (!user) {
    const [newUser] = await db.insert(usersTable).values({
      googleId: "demo-google-id",
      name: "Ahmed Khan",
      email: "ahmed@parhai.com",
      avatarUrl: null,
      level: null,
      subjectIds: [],
      onboarded: false,
      streakDays: 7,
    }).returning();
    user = newUser;
  }

  res.json(formatUser(user));
});

router.patch("/user/profile", async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.level !== undefined) updateData.level = parsed.data.level;
  if (parsed.data.subjectIds !== undefined) updateData.subjectIds = parsed.data.subjectIds.map(String);

  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, DEMO_USER_ID)).returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

router.post("/user/onboard", async (req, res): Promise<void> => {
  const parsed = OnboardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.update(usersTable).set({
    level: parsed.data.level,
    subjectIds: parsed.data.subjectIds.map(String),
    onboarded: true,
  }).where(eq(usersTable.id, DEMO_USER_ID)).returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

export default router;
