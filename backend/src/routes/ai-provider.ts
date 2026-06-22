import { Router, type IRouter } from "express";
import { generateAiAnswer, getAiConfigurationError, getAiStatus, isAiConfigured } from "../lib/ai-service";
import { requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

router.get("/ai/provider-status", requireAdmin, (_req, res) => {
  res.json({ ...getAiStatus(), configured: isAiConfigured(), connectionStatus: "not_tested", error: getAiConfigurationError() });
});

router.post("/ai/provider-test", requireAdmin, async (req, res): Promise<void> => {
  const status = getAiStatus();
  if (!isAiConfigured()) { res.status(503).json({ ...status, configured: false, connectionStatus: "missing_key", error: getAiConfigurationError() }); return; }
  try {
    const response = await generateAiAnswer("You are a connectivity test. Reply briefly and do not include secrets.", "Reply exactly: Parhai AI connection successful.");
    res.json({ ...status, configured: true, connectionStatus: "connected", testResponse: response });
  } catch (error) {
    req.log.error({ error, provider: status.provider }, "AI provider connection test failed");
    res.status(503).json({ ...status, configured: true, connectionStatus: "failed", error: error instanceof Error ? error.message : "AI provider test failed." });
  }
});

export default router;
