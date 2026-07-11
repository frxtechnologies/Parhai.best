import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiAssistantRouter from "./ai-assistant";
import ingestionRouter from "./ingestion";
import resourcesRouter from "./resources";
import aiProviderRouter from "./ai-provider";
import topicMapsRouter from "./topic-maps";
import revisionPlannerRouter from "./revision-planner";
import adminUsersRouter from "./admin-users";
import questionSolverRouter from "./question-solver";
import notesGeneratorRouter from "./notes-generator";
import paperCheckerRouter from "./paper-checker";
import adminTopicReviewRouter from "./admin-topic-review";
import adminIntelligenceRouter from "./admin-intelligence";
import adminLedgerRouter from "./admin-ledger";
import knowledgeRouter from "./knowledge";
import adminModelsRouter from "./admin-models";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiAssistantRouter);
router.use(ingestionRouter);
router.use(resourcesRouter);
router.use(aiProviderRouter);
router.use(topicMapsRouter);
router.use(revisionPlannerRouter);
router.use(adminUsersRouter);
router.use(questionSolverRouter);
router.use(notesGeneratorRouter);
router.use(paperCheckerRouter);
router.use(adminTopicReviewRouter);
router.use(adminIntelligenceRouter);
router.use(adminLedgerRouter);
router.use(knowledgeRouter);
router.use(adminModelsRouter);

export default router;
