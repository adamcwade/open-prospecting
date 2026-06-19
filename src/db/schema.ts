import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const prospectStatus = pgEnum("prospect_status", [
  "new", // discovered, has phone + website
  "incomplete", // discovered but missing phone or website
  "researched", // tasks generated
  "scripted", // outreach script + message generated, ready to contact
]);

// ---------------------------------------------------------------------------
// Prospects
// ---------------------------------------------------------------------------

export const prospects = pgTable(
  "prospects",
  {
    id: serial("id").primaryKey(),
    businessName: text("business_name").notNull(),
    industry: text("industry"),
    phone: text("phone"),
    email: text("email"),
    websiteUrl: text("website_url"),
    status: prospectStatus("status").notNull().default("new"),
    source: text("source"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneIdx: uniqueIndex("prospects_phone_uniq").on(t.phone),
    domainIdx: uniqueIndex("prospects_website_uniq").on(t.websiteUrl),
    statusIdx: index("prospects_status_idx").on(t.status),
  })
);

export const discoveryRuns = pgTable(
  "discovery_runs",
  {
    id: serial("id").primaryKey(),
    runDate: text("run_date").notNull(),
    addedCount: integer("added_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Required for the `onConflict(runDate)` upsert in bumpCounter (one row per day).
  (t) => ({ runDateIdx: uniqueIndex("discovery_runs_date_uniq").on(t.runDate) })
);

export const researchTasks = pgTable("research_tasks", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id")
    .notNull()
    .references(() => prospects.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  // Short, scannable points shown under each task on the prospect page. The
  // longer `description` is kept for script generation.
  bullets: jsonb("bullets").$type<string[]>().notNull().default([]),
  // Why this task matters: revenue (grows sales), cost (cuts spend/admin), or other.
  // Tasks are ordered revenue → cost → other.
  impact: text("impact").notNull().default("other"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scripts = pgTable("scripts", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id")
    .notNull()
    .references(() => prospects.id, { onDelete: "cascade" }),
  // A suggested talking-points script for a call, and a short outreach message
  // (usable for SMS or email). Both are starting points for manual outreach.
  voiceScript: text("voice_script").notNull(),
  smsScript: text("sms_script").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
