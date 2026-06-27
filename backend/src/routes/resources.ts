import { Router, type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin, requireUser } from "../middleware/auth";
import { processResourceById } from "../services/resource-job";
import { importLegacyPapers } from "../services/legacy-import";
import { getResourceDeletionPreview, permanentlyDeleteResource } from "../services/resource-deletion";

const router: IRouter = Router();

router.get("/resources/:resourceId/view-url", requireUser, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }
  const { data: resource, error } = await client.from("resources").select("bucket,storage_path,is_approved").eq("id", resourceId).eq("is_approved", true).single();
  if (error || !resource) { res.status(404).json({ error: "Approved resource not found." }); return; }
  const { data, error: signError } = await client.storage.from(resource.bucket).createSignedUrl(resource.storage_path, 3600);
  if (signError || !data?.signedUrl) { res.status(422).json({ error: "The source PDF is currently unavailable." }); return; }
  res.json({ url: data.signedUrl });
});

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
    .select("id,question_number,topic,subtopic,difficulty,marks,question_text,answer_text,source_file,source_page,bbox,crop_status,question_screenshot_url,question_images(id,image_url,image_path,page_number,bbox,image_order,needs_review)")
    .eq("resource_id", resourceId).order("id");
  if (error) { res.status(422).json({ error: error.message }); return; }
  res.json({ questions: data ?? [] });
});

router.patch("/questions/:questionId/crop-review", requireAdmin, async (req, res): Promise<void> => {
  const questionId = Number(req.params.questionId);
  const status = String(req.body?.status ?? "");
  if (!Number.isInteger(questionId) || questionId <= 0) { res.status(400).json({ error: "Invalid question id." }); return; }
  if (!["correct", "incorrect"].includes(status)) { res.status(400).json({ error: "Crop status must be correct or incorrect." }); return; }
  const client = res.locals.supabase as SupabaseClient;
  const { data, error } = await client.from("question_index").update({ crop_status: status, updated_at: new Date().toISOString() })
    .eq("id", questionId).select("id,crop_status").single();
  if (error) { res.status(422).json({ error: error.message }); return; }
  res.json(data);
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
