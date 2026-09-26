import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import uploadRouter from "./uploads";
import paymentsRouter from "./payments";
import addressesRouter from "./addresses";
import networkRouter from "./network";
import jobsRouter from "./jobs";
import adminRouter from "./admin";
import conversationsRouter from "./conversations";
import supportRouter from "./support";
import notificationsRouter from "./notifications";
import guildsRouter from "./guilds";
import securityRouter from "./security";
import teamRouter from "./team";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(uploadRouter);
router.use(paymentsRouter);
router.use(addressesRouter);
router.use(networkRouter);
router.use(jobsRouter);
router.use(adminRouter);
router.use(conversationsRouter);
router.use(supportRouter);
router.use(notificationsRouter);
router.use(guildsRouter);
router.use(securityRouter);
router.use(teamRouter);

export default router;
