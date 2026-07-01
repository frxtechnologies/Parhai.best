import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiAssistantRouter from "./ai-assistant";
import ingestionRouter from "./ingestion";
import resourcesRouter from "./resources";
import aiProviderRouter from "./ai-provider";
import topicMapsRouter from "./topic-maps";
import paperCheckerRouter from "./paper-checker";
import examEngineRouter from "./exam-engine";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiAssistantRouter);
router.use(ingestionRouter);
router.use(resourcesRouter);
router.use(aiProviderRouter);
router.use(topicMapsRouter);
router.use(paperCheckerRouter);
router.use(examEngineRouter);

export default router;
