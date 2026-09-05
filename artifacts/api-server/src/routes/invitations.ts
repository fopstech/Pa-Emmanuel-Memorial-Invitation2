import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetInvitationParams,
  UpdateRsvpBody,
  UpdateRsvpParams,
} from "@workspace/api-zod";
import { db, guestsTable } from "@workspace/db";
import { memorialEvent } from "../lib/event";
import { findGuestByToken, serializeInvitation } from "../lib/guest-utils";

const router: IRouter = Router();

router.get("/event", (_req, res) => {
  res.json(memorialEvent);
});

router.get("/invitations/:token", async (req, res) => {
  const { token } = GetInvitationParams.parse(req.params);
  const guest = await findGuestByToken(token);
  if (!guest) {
    res.status(404).json({ error: "Invitation not found." });
    return;
  }
  res.json(serializeInvitation(guest, req));
});

router.patch("/invitations/:token/rsvp", async (req, res) => {
  const { token } = UpdateRsvpParams.parse(req.params);
  const { status } = UpdateRsvpBody.parse(req.body);
  const [guest] = await db
    .update(guestsTable)
    .set({ rsvpStatus: status, updatedAt: new Date() })
    .where(eq(guestsTable.token, token))
    .returning();

  if (!guest) {
    res.status(404).json({ error: "Invitation not found." });
    return;
  }
  res.json(serializeInvitation(guest, req));
});

export default router;