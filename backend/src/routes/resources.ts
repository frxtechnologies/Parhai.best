import { Router, type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../middleware/auth";
import { processResourceById } from "../services/resource-job";
import { importLegacyPapers } from "../services/legacy-import";
import { getResourceDeletionPreview, permanentlyDeleteResource } from "../services/resource-deletion";

const router: IRouter = Router();

router.post("/resources/import-legacy", requireAdmin, async (req, res): Promise<void> => {
  try {
    const result = await importLegacyPapers(res.locals.supabase as SupabaseClient);
    req.log.info(result, "Legacy papers imported into resource pipeline");
    res.json(result);
  } catch (error) {
    req.log.error({ error }, "Legacy import failed");
    res.status(422).json({ error: error instanceof Error ? error.message : "Legacy import failed." });
  }
});

router.post("/resources/:resourceId/process", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }

  try {
    const result = await processResourceById(client, resourceId);
    req.log.info({ resourceId, ...result }, "Resource processing completed");
    res.json({ resourceId, extractedCharacters: result.extractedText.length, ...result, extractedText: undefined });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message
      : cause && typeof cause === "object" && "message" in cause ? String(cause.message)
        : "Resource processing failed.";
    req.log.error({ resourceId, error: cause }, "Resource processing failed");
    res.status(422).json({ error: message });
  }
});

router.get("/resources/:resourceId/questions", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }
  const { data, error } = await client.from("question_index")
    .select("id,question_number,topic,subtopic,difficulty,marks,question_text,answer_text,source_file")
    .eq("resource_id", resourceId).order("id");
  if (error) { res.status(422).json({ error: error.message }); return; }
  res.json({ questions: data ?? [] });
});

router.get("/resources/:resourceId/delete-preview", requireAdmin, async (req, res): Promise<void> => {
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getResourceDeletionPreview(res.locals.supabase as SupabaseClient, resourceId));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Resource not found." });
  }
});

router.delete("/resources/:resourceId", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }
  try {
    const result = await permanentlyDeleteResource(client, resourceId);
    req.log.info(result, "Resource permanently deleted");
    res.json(result);
  } catch (error) {
    req.log.error({ resourceId, error }, "Permanent resource deletion failed");
    res.status(422).json({ error: error instanceof Error ? error.message : "Resource deletion failed." });
  }
});

export default router;
