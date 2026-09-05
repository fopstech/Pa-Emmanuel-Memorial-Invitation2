import { Router, type IRouter } from "express";
import { CheckInGuestBody } from "@workspace/api-zod";
import { requireUsher } from "../lib/admin-auth";
import { checkInGuest, parseInvitationCode } from "../lib/guest-utils";

const router: IRouter = Router();

router.post("/check-in", requireUsher, async (req, res) => {
  const { invitationCode } = CheckInGuestBody.parse(req.body);
  res.json(await checkInGuest(parseInvitationCode(invitationCode)));
});

export default router;