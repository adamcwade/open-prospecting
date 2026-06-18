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
  "new",
  "incomplete",
  "researched",
  "scripted",
  "queued",
  "contacted",
  "agreed", // a "sale" — agreed to sign up
  "signed_up", // converted to a paying client on the website
  "declined",
  "opted_out",
]);

export const channel = pgEnum("channel", ["voice", "sms", "email"]);

export const attemptOutcome = pgEnum("attempt_outcome", [
  "no_answer",
  "voicemail",
  "connected",
  "declined",
  "opted_out",
  "agreed",
  "failed",
]);

export const numberState = pgEnum("number_state", ["pool", "assigned", "resting"]);

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
  // longer `description` is kept for script generation. Empty for rows created
  // before this column existed until the backfill populates them.
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
  strategyId: integer("strategy_id").references(() => strategies.id),
  voiceScript: text("voice_script").notNull(),
  smsScript: text("sms_script").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactAttempts = pgTable(
  "contact_attempts",
  {
    id: serial("id").primaryKey(),
    prospectId: integer("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "cascade" }),
    channel: channel("channel").notNull(),
    fromNumber: text("from_number"),
    toNumber: text("to_number"),
    outcome: attemptOutcome("outcome"),
    durationSeconds: integer("duration_seconds"),
    recordingUrl: text("recording_url"),
    twilioSid: text("twilio_sid"),
    disclosurePlayed: boolean("disclosure_played").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({ prospectIdx: index("attempts_prospect_idx").on(t.prospectId) })
);

export const transcripts = pgTable("transcripts", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id")
    .notNull()
    .references(() => contactAttempts.id, { onDelete: "cascade" }),
  turns: jsonb("turns").notNull().default([]),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const optOuts = pgTable(
  "opt_outs",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ phoneIdx: uniqueIndex("opt_outs_phone_uniq").on(t.phone) })
);

export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull(),
  pitchAngle: text("pitch_angle").notNull(),
  objectionHandling: text("objection_handling").notNull(),
  targetVerticalMix: jsonb("target_vertical_mix").notNull().default({}),
  rationale: text("rationale"),
  isActive: boolean("is_active").notNull().default(false),
  createdByCall: integer("created_by_call"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const phoneNumbers = pgTable("phone_numbers", {
  id: serial("id").primaryKey(),
  e164: text("e164").notNull().unique(),
  areaCode: text("area_code"),
  state: numberState("state").notNull().default("pool"),
  assignedClientId: integer("assigned_client_id"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  restUntil: timestamp("rest_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
