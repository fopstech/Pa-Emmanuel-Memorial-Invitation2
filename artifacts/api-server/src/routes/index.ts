import { Router, type IRouter } from "express";
import healthRouter from "./health";
import invitationRouter from "./invitations";
import checkInRouter from "./check-in";
import adminRouter from "./admin";
import accessRouter from "./access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(invitationRouter);
router.use(checkInRouter);
router.use(adminRouter);
router.use(accessRouter);

export default router;
