import {
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guestsTable = pgTable(
  "memorial_guests",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 80 }),
    email: varchar("email", { length: 320 }),
    token: varchar("token", { length: 128 }).notNull(),
    rsvpStatus: varchar("rsvp_status", {
      length: 20,
      enum: ["pending", "attending", "not_attending"],
    })
      .notNull()
      .default("pending"),
    checkedIn: boolean("checked_in").notNull().default(false),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    tokenUnique: uniqueIndex("memorial_guests_token_unique").on(table.token),
    nameIndex: index("memorial_guests_name_idx").on(table.name),
    rsvpIndex: index("memorial_guests_rsvp_idx").on(table.rsvpStatus),
    checkInIndex: index("memorial_guests_checked_in_idx").on(table.checkedIn),
  }),
);

export const insertGuestSchema = createInsertSchema(guestsTable).omit({
  id: true,
  token: true,
  rsvpStatus: true,
  checkedIn: true,
  checkedInAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGuest = z.infer<typeof insertGuestSchema>;
export type Guest = typeof guestsTable.$inferSelect;

export const guestIdSchema = z.number().int().positive();