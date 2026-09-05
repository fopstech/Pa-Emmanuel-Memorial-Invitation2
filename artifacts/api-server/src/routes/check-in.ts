import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { CheckInGuestBody } from "@workspace/api-zod";
import { db, guestsTable } from "@workspace/db";
import { parseInvitationCode } from "../lib/guest-utils";

const router: IRouter = Router();

router.post("/check-in", async (req, res) => {
  const { invitationCode } = CheckInGuestBody.parse(req.body);
  const token = parseInvitationCode(invitationCode);
  const result = await db.transaction(async (tx) => {
    const [guest] = await tx
      .select()
      .from(guestsTable)
      .where(eq(guestsTable.token, token))
      .limit(1);

    if (!guest) {
      return {
        result: "invalid" as const,
        guestName: null,
        rsvpStatus: "pending" as const,
        checkedInAt: null,
      };
    }

    if (guest.checkedIn) {
      return {
        result: "already_checked_in" as const,
        guestName: guest.name,
        rsvpStatus: guest.rsvpStatus,
        checkedInAt: guest.checkedInAt?.toISOString() ?? null,
      };
    }

    const now = new Date();
    const [updated] = await tx
      .update(guestsTable)
      .set({ checkedIn: true, checkedInAt: now, updatedAt: now })
      .where(and(eq(guestsTable.id, guest.id), eq(guestsTable.checkedIn, false)))
      .returning();

    if (updated) {
      return {
        result: "successful" as const,
        guestName: updated.name,
        rsvpStatus: updated.rsvpStatus,
        checkedInAt: updated.checkedInAt?.toISOString() ?? now.toISOString(),
      };
    }

    const [racedGuest] = await tx
      .select()
      .from(guestsTable)
      .where(eq(guestsTable.id, guest.id))
      .limit(1);
    return {
      result: "already_checked_in" as const,
      guestName: racedGuest?.name ?? guest.name,
      rsvpStatus: racedGuest?.rsvpStatus ?? guest.rsvpStatus,
      checkedInAt: racedGuest?.checkedInAt?.toISOString() ?? null,
    };
  });

  res.json(result);
});

export default router;