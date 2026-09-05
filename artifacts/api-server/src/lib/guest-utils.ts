import crypto from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db, guestsTable, type Guest } from "@workspace/db";
import type { Request } from "express";
import { invitationUrl, memorialEvent } from "./event";

export function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() || "";
}

export function cleanOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function generateInvitationToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function generateInvitationCode() {
  return `PMA-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createUniqueToken() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateInvitationToken();
    const [existing] = await db
      .select({ id: guestsTable.id })
      .from(guestsTable)
      .where(eq(guestsTable.token, token))
      .limit(1);
    if (!existing) return token;
  }
  throw new Error("Could not create a unique invitation token.");
}

export async function createUniqueInvitationCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invitationCode = generateInvitationCode();
    const [existing] = await db
      .select({ id: guestsTable.id })
      .from(guestsTable)
      .where(eq(guestsTable.invitationCode, invitationCode))
      .limit(1);
    if (!existing) return invitationCode;
  }
  throw new Error("Could not create a unique invitation code.");
}

export function serializeGuest(guest: Guest, req: Request) {
  return {
    id: guest.id,
    name: guest.name,
    phone: guest.phone,
    email: guest.email,
    invitationCode: guest.invitationCode,
    token: guest.token,
    invitationUrl: invitationUrl(guest.token, req),
    rsvpStatus: guest.rsvpStatus,
    checkedIn: guest.checkedIn,
    checkedInAt: guest.checkedInAt?.toISOString() ?? null,
    createdAt: guest.createdAt.toISOString(),
    updatedAt: guest.updatedAt.toISOString(),
  };
}

export function serializeInvitation(guest: Guest, req: Request) {
  return {
    name: guest.name,
    token: guest.token,
    invitationUrl: invitationUrl(guest.token, req),
    event: memorialEvent,
    rsvpStatus: guest.rsvpStatus,
    checkedIn: guest.checkedIn,
    checkedInAt: guest.checkedInAt?.toISOString() ?? null,
  };
}

export async function findDuplicateGuest(name: string, phone: string | null, email: string | null) {
  const normalizedName = normalize(name);
  const normalizedPhone = normalize(phone);
  const normalizedEmail = normalize(email);
  const matches = await db
    .select()
    .from(guestsTable)
    .where(
      or(
        eq(guestsTable.name, name.trim()),
        phone ? eq(guestsTable.phone, phone) : undefined,
        email ? eq(guestsTable.email, email) : undefined,
      ),
    )
    .limit(20);
  return matches.find(
    (guest) =>
      normalize(guest.name) === normalizedName ||
      (normalizedPhone && normalize(guest.phone) === normalizedPhone) ||
      (normalizedEmail && normalize(guest.email) === normalizedEmail),
  );
}

export async function findGuestByToken(token: string) {
  const [guest] = await db
    .select()
    .from(guestsTable)
    .where(eq(guestsTable.token, token))
    .limit(1);
  return guest;
}

export async function checkInGuest(identifier: string) {
  return db.transaction(async (tx) => {
    const [guest] = await tx
      .select()
      .from(guestsTable)
      .where(or(eq(guestsTable.token, identifier), eq(guestsTable.invitationCode, identifier)))
      .limit(1);
    if (!guest) return { result: "invalid" as const, guestName: null, rsvpStatus: "pending" as const, checkedInAt: null };
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
    const [racedGuest] = await tx.select().from(guestsTable).where(eq(guestsTable.id, guest.id)).limit(1);
    return {
      result: "already_checked_in" as const,
      guestName: racedGuest?.name ?? guest.name,
      rsvpStatus: racedGuest?.rsvpStatus ?? guest.rsvpStatus,
      checkedInAt: racedGuest?.checkedInAt?.toISOString() ?? null,
    };
  });
}

export function parseInvitationCode(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\/invite\/([^/?#]+)/i);
  return match?.[1] ?? trimmed;
}
