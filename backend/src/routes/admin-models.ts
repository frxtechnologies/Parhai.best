import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { rollbackTo, syncActiveModelToDisk } from "../services/model-registry";
import { MODEL_PATH, reloadLocalModel } from "../services/local-topic-classifier";

const router: IRouter = Router();

/** List model versions with metrics + status. GET /api/admin/models?model_key=topic-classifier */
router.get("/admin/models", requireAdmin, async (req, res): Promise<void> => {
  const modelKey = z.string().optional().parse(req.query.model_key) ?? "topic-classifier";
  const { data, error } = await supabaseAdmin
    .from("model_registry")
    .select("id,model_key,version,status,metrics,train_size,created_at,activated_at")
    .eq("model_key", modelKey)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ modelKey, versions: data ?? [] });
});

const RollbackBody = z.object({ model_key: z.string().default("topic-classifier"), version: z.string().min(1) });

/** Roll back to a previous version and sync it to the inference path. */
router.post("/admin/models/rollback", requireAdmin, async (req, res): Promise<void> => {
  const parsed = RollbackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") }); return; }
  const result = await rollbackTo(supabaseAdmin, parsed.data.model_key, parsed.data.version);
  if (!result.ok) { res.status(400).json({ error: result.reason }); return; }
  // Push the now-active artifact to disk and refresh the cached model.
  if (parsed.data.model_key === "topic-classifier") {
    await syncActiveModelToDisk(supabaseAdmin, "topic-classifier", MODEL_PATH);
    reloadLocalModel();
  }
  res.json(result);
});

export default router;
