import { Router, type IRouter } from "express";
import { db, aiMessagesTable, subjectsTable } from "../db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const DEMO_USER_ID = 1;

const SendMessageBody = z.object({
  subjectId: z.number(),
  message: z.string().min(1),
});

function generateAiResponse(message: string, subjectName: string): string {
  const m = message.toLowerCase();

  if (m.includes("help") || m.includes("explain")) {
    return `Great question! In ${subjectName}, this is a fundamental concept. Let me break it down step by step. The key idea is to understand the underlying principles rather than memorize formulas. Would you like me to walk through a worked example?`;
  }
  if (m.includes("formula") || m.includes("equation")) {
    return `For ${subjectName}, the relevant formula depends on the specific topic. Make sure you understand the derivation, not just the result — Cambridge examiners love to test this understanding.`;
  }
  if (m.includes("exam") || m.includes("paper") || m.includes("tip")) {
    return `Top exam tips for ${subjectName}: (1) Read every question twice. (2) Show all working — partial marks count. (3) Check units. (4) Manage time carefully. (5) Practice from the last 5 years of past papers.`;
  }
  if (m.includes("hello") || m.includes("hi") || m.includes("hey")) {
    return `Hello! I'm your AI tutor for ${subjectName}. I'm here to help you understand concepts, work through problems, and prepare for your Cambridge exams. What would you like to work on today?`;
  }
  return `That's a thoughtful question about ${subjectName}. The key to mastering this is practice and understanding the "why" behind each concept. In Cambridge exams, showing your method clearly is just as important as getting the right answer. Would you like me to explain a specific concept or work through a past paper question with you?`;
}

router.post("/ai/chat", async (req, res): Promise<void> => {
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, parsed.data.subjectId));

  await db.insert(aiMessagesTable).values({
    userId: DEMO_USER_ID,
    subjectId: parsed.data.subjectId,
    role: "user",
    content: parsed.data.message,
  });

  const aiResponse = generateAiResponse(parsed.data.message, subject?.name ?? "this subject");
  const [aiMsg] = await db.insert(aiMessagesTable).values({
    userId: DEMO_USER_ID,
    subjectId: parsed.data.subjectId,
    role: "assistant",
    content: aiResponse,
  }).returning();

  res.json({
    id: aiMsg.id,
    subjectId: aiMsg.subjectId,
    role: aiMsg.role,
    content: aiMsg.content,
    createdAt: aiMsg.createdAt.toISOString(),
  });
});

router.get("/ai/chat/:subjectId", async (req, res): Promise<void> => {
  const subjectId = parseInt(req.params.subjectId, 10);
  if (isNaN(subjectId)) { res.status(400).json({ error: "Invalid subjectId" }); return; }

  const messages = await db.select().from(aiMessagesTable)
    .where(eq(aiMessagesTable.subjectId, subjectId))
    .orderBy(asc(aiMessagesTable.createdAt));

  res.json(messages.map(m => ({
    id: m.id,
    subjectId: m.subjectId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  })));
});

export default router;
