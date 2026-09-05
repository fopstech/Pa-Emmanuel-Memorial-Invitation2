import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import {
  AdminLoginBody,
  CreateGuestBody,
  GetGuestParams,
  ImportGuestsBody,
  ListGuestsQueryParams,
  PreviewGuestImportBody,
  UpdateGuestBody,
  UpdateGuestParams,
} from "@workspace/api-zod";
import { db, guestsTable } from "@workspace/db";
import {
  adminIsConfigured,
  clearAdminSession,
  accessCodeMatches,
  getAdminUsername,
  requireAdmin,
  setAdminSession,
} from "../lib/admin-auth";
import { parseGuestCsv } from "../lib/csv";
import {
  cleanOptional,
  createUniqueInvitationCode,
  createUniqueToken,
  findDuplicateGuest,
  normalize,
  serializeGuest,
} from "../lib/guest-utils";

const router: IRouter = Router();

router.post("/admin/login", (req, res) => {
  const { accessCode } = AdminLoginBody.parse(req.body);
  if (!adminIsConfigured()) {
    res.status(503).json({ error: "Admin access is not configured." });
    return;
  }
  if (!accessCodeMatches(accessCode, "admin")) {
    res.status(401).json({ error: "Incorrect admin access code." });
    return;
  }
  setAdminSession(res);
  res.json({ authenticated: true, username: "administrator" });
});

router.post("/admin/logout", (req, res) => {
  clearAdminSession(res);
  res.status(204).send();
});

router.get("/admin/session", (req, res) => {
  const username = getAdminUsername(req);
  if (!username) {
    res.status(401).json({ error: "Administrator authentication required." });
    return;
  }
  res.json({ authenticated: true, username });
});

router.use("/admin", requireAdmin);

router.get("/admin/dashboard", async (_req, res) => {
  const [summary] = await db
    .select({
      totalGuests: sql<number>`count(*)::int`,
      attending: sql<number>`count(*) filter (where ${guestsTable.rsvpStatus} = 'attending')::int`,
      notAttending: sql<number>`count(*) filter (where ${guestsTable.rsvpStatus} = 'not_attending')::int`,
      pendingRsvp: sql<number>`count(*) filter (where ${guestsTable.rsvpStatus} = 'pending')::int`,
      checkedIn: sql<number>`count(*) filter (where ${guestsTable.checkedIn} = true)::int`,
      notCheckedIn: sql<number>`count(*) filter (where ${guestsTable.checkedIn} = false)::int`,
    })
    .from(guestsTable);
  res.json(summary);
});

router.get("/admin/guests", async (req, res) => {
  const filters = ListGuestsQueryParams.parse(req.query);
  const conditions = [];
  if (filters.search) {
    conditions.push(
      or(
        ilike(guestsTable.name, `%${filters.search}%`),
        ilike(guestsTable.email, `%${filters.search}%`),
        ilike(guestsTable.phone, `%${filters.search}%`),
      ),
    );
  }
  if (filters.rsvpStatus) conditions.push(eq(guestsTable.rsvpStatus, filters.rsvpStatus));
  if (filters.checkInStatus === "checked_in") conditions.push(eq(guestsTable.checkedIn, true));
  if (filters.checkInStatus === "not_checked_in") conditions.push(eq(guestsTable.checkedIn, false));

  const guests = await db
    .select()
    .from(guestsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(guestsTable.name));
  res.json(guests.map((guest) => serializeGuest(guest, req)));
});

router.post("/admin/guests", async (req, res) => {
  const input = CreateGuestBody.parse(req.body);
  const name = input.name.trim();
  const phone = cleanOptional(input.phone);
  const email = cleanOptional(input.email);
  if (await findDuplicateGuest(name, phone, email)) {
    res.status(409).json({ error: "A guest with matching details already exists." });
    return;
  }
  const [invitationCode, token] = await Promise.all([
    createUniqueInvitationCode(),
    createUniqueToken(),
  ]);
  const [guest] = await db
    .insert(guestsTable)
    .values({ name, phone, email, invitationCode, token })
    .returning();
  res.status(201).json(serializeGuest(guest, req));
});

router.get("/admin/guests/:id", async (req, res) => {
  const { id } = GetGuestParams.parse({ id: Number(req.params.id) });
  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, id)).limit(1);
  if (!guest) {
    res.status(404).json({ error: "Guest not found." });
    return;
  }
  res.json(serializeGuest(guest, req));
});

router.patch("/admin/guests/:id", async (req, res) => {
  const { id } = UpdateGuestParams.parse({ id: Number(req.params.id) });
  const input = UpdateGuestBody.parse(req.body);
  const changes = {
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.phone === undefined ? {} : { phone: cleanOptional(input.phone) }),
    ...(input.email === undefined ? {} : { email: cleanOptional(input.email) }),
    updatedAt: new Date(),
  };
  const [guest] = await db
    .update(guestsTable)
    .set(changes)
    .where(eq(guestsTable.id, id))
    .returning();
  if (!guest) {
    res.status(404).json({ error: "Guest not found." });
    return;
  }
  res.json(serializeGuest(guest, req));
});

router.delete("/admin/guests/:id", async (req, res) => {
  const { id } = GetGuestParams.parse({ id: Number(req.params.id) });
  const deleted = await db.delete(guestsTable).where(eq(guestsTable.id, id)).returning({ id: guestsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Guest not found." });
    return;
  }
  res.status(204).send();
});

async function buildImportPreview(csvText: string) {
  const parsed = parseGuestCsv(csvText);
  const seen = new Set<string>();
  const rows = [];
  for (const row of parsed.rows) {
    const name = row.name.trim();
    const phone = cleanOptional(row.phone);
    const email = cleanOptional(row.email);
    let error: string | null = null;
    let duplicate = false;
    if (!parsed.hasNameColumn) error = "CSV must contain a Name column.";
    else if (!name) error = "Name is required.";
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Email is invalid.";

    const fingerprint = `${normalize(name)}|${normalize(phone)}|${normalize(email)}`;
    if (!error && seen.has(fingerprint)) duplicate = true;
    if (!error && !duplicate && (await findDuplicateGuest(name, phone, email))) duplicate = true;
    if (duplicate) error = "Duplicate guest will be skipped.";
    if (!error) seen.add(fingerprint);
    rows.push({
      rowNumber: row.rowNumber,
      name,
      phone,
      email,
      valid: !error,
      duplicate,
      error,
    });
  }
  return {
    headers: parsed.headers,
    rows,
    validCount: rows.filter((row) => row.valid).length,
    invalidCount: rows.filter((row) => !row.valid && !row.duplicate).length,
    duplicateCount: rows.filter((row) => row.duplicate).length,
  };
}

router.post("/admin/import/preview", async (req, res) => {
  const { csvText } = PreviewGuestImportBody.parse(req.body);
  const preview = await buildImportPreview(csvText);
  res.json(preview);
});

router.post("/admin/import", async (req, res) => {
  const { csvText } = ImportGuestsBody.parse(req.body);
  const preview = await buildImportPreview(csvText);
  const importable = preview.rows.filter((row) => row.valid);
  const guests = await db.transaction(async (tx) => {
    const created = [];
    for (const row of importable) {
      const [invitationCode, token] = await Promise.all([
        createUniqueInvitationCode(),
        createUniqueToken(),
      ]);
      const [guest] = await tx
        .insert(guestsTable)
        .values({ name: row.name, phone: row.phone, email: row.email, invitationCode, token })
        .returning();
      created.push(guest);
    }
    return created;
  });
  res.json({
    importedCount: guests.length,
    skippedCount: preview.duplicateCount,
    invalidCount: preview.invalidCount,
    guests: guests.map((guest) => serializeGuest(guest, req)),
  });
});

export default router;