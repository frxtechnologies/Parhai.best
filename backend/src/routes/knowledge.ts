import { Router, type IRouter } from "express";
import { requireUser } from "../middleware/auth";
import { createUserClient } from "../lib/supabase";
import { getRelatedQuestions, getFrequentlyTestedTopics } from "../services/knowledge-graph";
import { getTopicName } from "../services/taxonomy-classifier";

const router: IRouter = Router();

function userClient(req: { header(name: string): string | undefined }) {
  return createUserClient(req.header("authorization")?.replace(/^Bearer\s+/i, "")!);
}

/** Frequently tested concepts for a subject (graph lookup, no AI). */
router.get("/subjects/:id/frequent-topics", requireUser, async (req, res): Promise<void> => {
  const subjectId = Number(req.params.id);
  if (!Number.isFinite(subjectId) || subjectId <= 0) { res.status(400).json({ error: "Invalid subject id." }); return; }
  try {
    const topics = await getFrequentlyTestedTopics(userClient(req), subjectId, Math.min(Number(req.query.limit ?? 15), 50));
    res.json({ topics: topics.map((t) => ({ ...t, name: getTopicName(t.topicId) })) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not load frequent topics." });
  }
});

/** Related questions for a question (materialized nearest neighbours). */
router.get("/questions/:id/related", requireUser, async (req, res): Promise<void> => {
  const questionId = Number(req.params.id);
  if (!Number.isFinite(questionId) || questionId <= 0) { res.status(400).json({ error: "Invalid question id." }); return; }
  try {
    const related = await getRelatedQuestions(userClient(req), questionId, Math.min(Number(req.query.limit ?? 6), 20));
    res.json({ related });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not load related questions." });
  }
});

export default router;
