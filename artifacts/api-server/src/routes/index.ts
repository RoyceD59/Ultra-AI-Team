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
// Team Horizon routers
import authRouter from "./auth";
import contactsRouter from "./contacts";
import notificationsRouter from "./notifications";
import systemStatusRouter from "./system-status";
import webhookRouter from "./webhook";
import whatsappRouter from "./whatsapp";

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
// Team Horizon
router.use(authRouter);
router.use(contactsRouter);
router.use(notificationsRouter);
router.use(systemStatusRouter);
router.use(webhookRouter);
router.use(whatsappRouter);

export default router;
