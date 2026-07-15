import { Router, type IRouter } from "express";
import healthRouter from "./health";
import membersRouter from "./members";
import projectsRouter from "./projects";
import tasksRouter from "./tasks";
import dashboardRouter from "./dashboard";
import anthropicRouter from "./anthropic/conversations";
import aiMonitorRouter from "./ai/monitor";

const router: IRouter = Router();

router.use(healthRouter);
router.use(membersRouter);
router.use(projectsRouter);
router.use(tasksRouter);
router.use(dashboardRouter);
router.use(anthropicRouter);
router.use(aiMonitorRouter);

export default router;
