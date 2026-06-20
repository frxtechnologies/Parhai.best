import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiAssistantRouter from "./ai-assistant";
import ingestionRouter from "./ingestion";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiAssistantRouter);
router.use(ingestionRouter);

export default router;
