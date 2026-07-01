import { Router, type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin, requireUser } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { processResourceById } from "../services/resource-job";
import { importLegacyPapers } from "../services/legacy-import";
import { getResourceDeletionPreview, permanentlyDeleteResource } from "../services/resource-deletion";
import { generateScreenshotsForResource, renderQuestionPreview, screenshotMode } from "../services/question-screenshots";
import { renderMarkingSchemePreview } from "../services/marking-scheme-preview";

const router: IRouter = Router();

router.get("/questions/:questionId/screenshot", requireUser, async (req, res): Promise<void> => {
  const questionId = Number(req.params.questionId);
  if (!Number.isInteger(questionId) || questionId <= 0) { res.status(400).json({ error: "Invalid question id." }); return; }
  if (screenshotMode() === "off") { res.status(404).json({ error: "Question previews are disabled." }); return; }
  try {
    const previewClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdmin : res.locals.supabase as SupabaseClient;
    const preview = await renderQuestionPreview(previewClient, questionId);
    req.log.info({
      questionId, resourcePath: preview.resourcePath, pageRendered: preview.pageNumber,
      bbox: preview.bbox, outputSize: preview.outputSize, screenshotStatus: preview.status,
      nonBlankRatio: preview.nonBlankRatio, cached: preview.cached,
    }, "On-demand screenshot generated");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Screenshot-Status", preview.status);
    res.setHeader("X-Rendered-Page", String(preview.pageNumber));
    res.setHeader("Cache-Control", screenshotMode() === "hybrid_cache" ? "public, max-age=86400" : "private, max-age=300");
    res.send(preview.buffer);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const reason = errorMessage.match(/^([a-z_]+):/)?.[1]
      ?? (errorMessage.toLowerCase().includes("download") ? "pdf_missing"
        : errorMessage.toLowerCase().includes("source_page") ? "source_page_missing"
          : errorMessage.toLowerCase().includes("bbox") ? "bbox_missing"
            : errorMessage.toLowerCase().includes("page_match") ? "page_match_failed"
              : "render_failed");
    req.log.warn({ questionId, reason, errorMessage }, "On-demand screenshot failed");
    res.status(422).json({ error: "Preview unavailable — open PDF instead.", reason });
  }
});

router.get("/questions/:questionId/marking-scheme/screenshot",requireUser,async(req,res):Promise<void>=>{
  const questionId=Number(req.params.questionId);
  if(!Number.isInteger(questionId)||questionId<=0){res.status(400).json({error:"Invalid question id."});return;}
  try{
    const preview=await renderMarkingSchemePreview(process.env.SUPABASE_SERVICE_ROLE_KEY?supabaseAdmin:res.locals.supabase as SupabaseClient,questionId);
    res.setHeader("Content-Type","image/png");res.setHeader("X-Mark-Scheme-Status",preview.status);res.setHeader("X-Rendered-Page",String(preview.pageNumber));res.setHeader("Cache-Control","private, max-age=300");res.send(preview.buffer);
  }catch(error){
    req.log.warn({questionId,error:error instanceof Error?error.message:String(error)},"Marking scheme preview failed");
    res.status(422).json({error:"Marking scheme preview unavailable — open PDF instead."});
  }
});

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
    .select("id,question_number,topic,subtopic,difficulty,marks,question_text,answer_text,source_file,source_page,bbox,crop_status,screenshot_status,question_screenshot_url,question_images(id,image_url,image_path,page_number,bbox,image_order,needs_review)")
    .eq("resource_id", resourceId).order("id");
  if (error) { res.status(422).json({ error: error.message }); return; }
  res.json({ questions: data ?? [] });
});

router.post("/resources/:resourceId/screenshots", requireAdmin, async (req, res): Promise<void> => {
  if (process.env.ENABLE_QUESTION_SCREENSHOTS !== "true") { res.status(409).json({ error: "Question screenshots are disabled. Set ENABLE_QUESTION_SCREENSHOTS=true on the backend." }); return; }
  const resourceId = Number(req.params.resourceId);
  if (!Number.isInteger(resourceId) || resourceId <= 0) { res.status(400).json({ error: "Invalid resource id." }); return; }
  try { res.json(await generateScreenshotsForResource(res.locals.supabase as SupabaseClient, resourceId)); }
  catch (error) { req.log.error({ resourceId, error }, "Screenshot generation failed"); res.status(422).json({ error: error instanceof Error ? error.message : "Screenshot generation failed." }); }
});

router.post("/questions/:questionId/screenshot", requireAdmin, async (req, res): Promise<void> => {
  if (process.env.ENABLE_QUESTION_SCREENSHOTS !== "true") { res.status(409).json({ error: "Question screenshots are disabled." }); return; }
  const client = res.locals.supabase as SupabaseClient;
  const questionId = Number(req.params.questionId);
  const { data } = await client.from("question_index").select("resource_id").eq("id", questionId).single();
  if (!data) { res.status(404).json({ error: "Question not found." }); return; }
  try { res.json(await generateScreenshotsForResource(client, data.resource_id, questionId)); }
  catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Screenshot generation failed." }); }
});

router.delete("/question-screenshot-cache", requireAdmin, async (req, res): Promise<void> => {
  const client = res.locals.supabase as SupabaseClient;
  const { data, error } = await client.storage.from("question-screenshots").list("on-demand", { limit: 1000 });
  if (error) { res.status(422).json({ error: error.message }); return; }
  const folders = (data ?? []).filter((entry) => !entry.id).map((entry) => entry.name);
  const paths: string[] = [];
  for (const folder of folders) {
    const { data: files } = await client.storage.from("question-screenshots").list(`on-demand/${folder}`, { limit: 1000 });
    paths.push(...(files ?? []).filter((entry) => entry.id).map((entry) => `on-demand/${folder}/${entry.name}`));
  }
  if (paths.length) {
    const { error: removeError } = await client.storage.from("question-screenshots").remove(paths);
    if (removeError) { res.status(422).json({ error: removeError.message }); return; }
  }
  res.json({ deleted: paths.length });
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
