import { Router, type IRouter } from "express";
import healthRouter from "./health";
import membersRouter from "./members";
import projectsRouter from "./projects";
import tasksRouter from "./tasks";
import dashboardRouter from "./dashboard";
import anthropicRouter from "./anthropic/conversations";
import aiMonitorRouter from "./ai/monitor";
import aiAgentQueryRouter from "./ai/agent-query";
import ucRouter from "./uc";
import ucWaterChatRouter from "./uc-water-chat";
import ucImpactRouter from "./uc-impact";
import ucOfflineClientsRouter from "./uc-offline-clients";
import storageRouter from "./storage";
import paymentsRouter from "./payments";
import referralsRouter from "./referrals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(membersRouter);
router.use(projectsRouter);
router.use(tasksRouter);
router.use(dashboardRouter);
router.use(anthropicRouter);
router.use(aiMonitorRouter);
router.use(aiAgentQueryRouter);
router.use(ucRouter);
router.use(ucWaterChatRouter);
router.use(ucImpactRouter);
router.use(ucOfflineClientsRouter);
router.use(storageRouter);
router.use(paymentsRouter);
router.use(referralsRouter);

export default router;
