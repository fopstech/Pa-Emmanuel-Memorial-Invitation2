import crypto from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db, guestsTable, type Guest } from "@workspace/db";
import type { Request } from "express";
import { invitationUrl } from "./event";

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

export function serializeGuest(guest: Guest, req: Request) {
  return {
    id: guest.id,
    name: guest.name,
    phone: guest.phone,
    email: guest.email,
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
    rsvpStatus: guest.rsvpStatus,
    checkedIn: guest.checkedIn,
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

export function parseInvitationCode(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\/invite\/([^/?#]+)/i);
  return match?.[1] ?? trimmed;
}
