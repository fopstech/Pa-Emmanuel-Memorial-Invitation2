import { Router, type IRouter } from "express";
import healthRouter from "./health";
import invitationRouter from "./invitations";
import checkInRouter from "./check-in";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(invitationRouter);
router.use(checkInRouter);
router.use(adminRouter);

export default router;
