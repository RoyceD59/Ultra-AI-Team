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
import paymentsRouter from "./payments";

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
router.use(paymentsRouter);

export default router;
