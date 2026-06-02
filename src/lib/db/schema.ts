import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// -----------------------------------------------------------------------------
// Phase 1 active tables
// -----------------------------------------------------------------------------

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    contactName: varchar("contact_name", { length: 200 }).notNull(),
    contactEmail: varchar("contact_email", { length: 320 }).notNull(),
    tone: varchar("tone", { length: 40 })
      .notNull()
      .default("friendly-professional"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index("clients_status_idx").on(t.status),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }),
    repos: text("repos")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientPosIdx: index("projects_client_position_idx").on(
      t.clientId,
      t.position,
    ),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    actorEmail: varchar("actor_email", { length: 320 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: uuid("entity_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId),
    createdAtIdx: index("audit_created_at_idx").on(t.createdAt),
  }),
);

// -----------------------------------------------------------------------------
// Phase 2+ dormant tables (defined now so Phase 2 doesn't ship an extra migration)
// -----------------------------------------------------------------------------

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  triggerScheduleId: varchar("trigger_schedule_id", { length: 64 })
    .notNull()
    .unique(),
  kind: varchar("kind", { length: 32 }).notNull(),
  externalId: varchar("external_id", { length: 64 }).notNull(),
  cron: varchar("cron", { length: 64 }).notNull(),
  timezone: varchar("timezone", { length: 64 })
    .notNull()
    .default("America/Bogota"),
  active: text("active").notNull().default("true"),
  nextRun: timestamp("next_run", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: varchar("kind", { length: 16 }).notNull(),
  weekLabel: varchar("week_label", { length: 8 }).notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("queued"),
  triggerRunId: varchar("trigger_run_id", { length: 64 }),
  scheduleId: uuid("schedule_id").references(() => schedules.id, {
    onDelete: "set null",
  }),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    clientName: varchar("client_name", { length: 200 }).notNull(),
    weekLabel: varchar("week_label", { length: 8 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    totalsPrs: integer("totals_prs").notNull().default(0),
    totalsIssues: integer("totals_issues").notNull().default(0),
    totalsCommits: integer("totals_commits").notNull().default(0),
    activityJson: jsonb("activity_json"),
    narrativeMd: text("narrative_md"),
    emailSubject: text("email_subject"),
    emailBody: text("email_body"),
    pdfBlobUrl: text("pdf_blob_url"),
    pdfFilename: text("pdf_filename"),
    gmailDraftId: varchar("gmail_draft_id", { length: 128 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    triggerRunId: varchar("trigger_run_id", { length: 64 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientWeekUq: uniqueIndex("reports_client_week_uq")
      .on(t.clientId, t.weekLabel)
      .where(sql`client_id IS NOT NULL`),
    runIdx: index("reports_run_idx").on(t.runId),
  }),
);

// -----------------------------------------------------------------------------
// Inferred types
// -----------------------------------------------------------------------------

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
