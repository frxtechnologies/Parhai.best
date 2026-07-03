import { Router, type IRouter } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "../middleware/auth";
import { FineTuningDatasetService } from "../services/fine-tuning-dataset";

const router: IRouter = Router();

router.get("/admin/fine-tuning-examples", requireAdmin, async (req, res) => {
  try {
    const rows = await new FineTuningDatasetService(res.locals.supabase as SupabaseClient)
      .list(typeof req.query.status === "string" ? req.query.status : undefined);
    res.json({ examples: rows });
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : "Could not load examples." });
  }
});

router.patch("/admin/fine-tuning-examples/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.qualityStatus ?? "");
  if (!Number.isInteger(id) || !["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "A valid example and review status are required." });
    return;
  }
  try {
    const row = await new FineTuningDatasetService(res.locals.supabase as SupabaseClient)
      .review(id, status as "approved" | "rejected", res.locals.user.id);
    res.json(row);
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : "Review failed." });
  }
});

router.get("/admin/fine-tuning-examples-export", requireAdmin, async (_req, res) => {
  try {
    const jsonl = await new FineTuningDatasetService(res.locals.supabase as SupabaseClient).exportApprovedJsonl();
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=parhai-approved-training-examples.jsonl");
    res.send(jsonl);
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : "Export failed." });
  }
});

export default router;
