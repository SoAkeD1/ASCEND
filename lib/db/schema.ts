import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Money is stored as whole rupees (integer), except revenue which can carry paise.
 * Day-level dates use `date` (string "YYYY-MM-DD"), because all business rules work in days.
 */
const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const userId = () => uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const day = (name: string) => date(name, { mode: "string" });

// ---------- configuration ----------
export const config = pgTable("config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

// ---------- identity ----------
export const users = pgTable("users", {
  id: id(),
  fullName: text("full_name"),
  email: text("email").unique(),
  phone: text("phone"),
  dob: day("dob"),
  college: text("college"),
  course: text("course"),
  year: integer("year"),
  enrolmentVerified: boolean("enrolment_verified").notNull().default(false),
  enrolmentMethod: text("enrolment_method"),
  /** Signup month, "YYYY-MM". The risk brake works per cohort. */
  cohort: text("cohort").notNull(),
  role: text("role", { enum: ["user", "lender", "admin"] }).notNull().default("user"),
  /** Demo time travel: this user's clock runs this many days ahead. Always 0 outside demo mode. */
  clockOffsetDays: integer("clock_offset_days").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  /** Set by "Delete my data": PII is wiped, anonymised loan rows stay. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("otp_email_idx").on(t.email)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: userId(),
    type: text("type", { enum: ["kyc", "aa", "bureau", "family_share"] }).notNull(),
    granted: boolean("granted").notNull(),
    purpose: text("purpose").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("consent_user_type").on(t.userId, t.type)],
);

export const kycRecords = pgTable("kyc_records", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  panLast4: text("pan_last4").notNull(),
  aadhaarLast4: text("aadhaar_last4").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  provider: text("provider").notNull(),
});

// ---------- underwriting ----------
export const statementUploads = pgTable("statement_uploads", {
  id: id(),
  userId: userId(),
  filename: text("filename").notNull(),
  /** Raw file, kept only if the user opted in. Otherwise null right after parsing. */
  content: text("content"),
  rows: integer("rows").notNull(),
  createdAt: createdAt(),
});

export const inflowTxns = pgTable(
  "inflow_txns",
  {
    id: id(),
    userId: userId(),
    date: day("date").notNull(),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    kind: text("kind", { enum: ["credit", "debit", "bounce"] }).notNull(),
    source: text("source", { enum: ["csv", "manual"] }).notNull(),
  },
  (t) => [index("inflow_user_idx").on(t.userId)],
);

export const bureauChecks = pgTable("bureau_checks", {
  id: id(),
  userId: userId(),
  status: text("status", { enum: ["none", "thin", "clean", "active_default"] }).notNull(),
  overdueAmount: integer("overdue_amount").notNull().default(0),
  sourceLabel: text("source_label").notNull(),
  checkedAt: createdAt(),
});

export const underwritingDecisions = pgTable("underwriting_decisions", {
  id: id(),
  userId: userId(),
  gate1Result: boolean("gate1_result"),
  avgInflow: integer("avg_inflow"),
  historyMonths: integer("history_months"),
  lastBounceDate: day("last_bounce_date"),
  payday: integer("payday"),
  gate2InflowOk: boolean("gate2_inflow_ok"),
  gate2HistoryOk: boolean("gate2_history_ok"),
  gate2BounceOk: boolean("gate2_bounce_ok"),
  decision: text("decision", { enum: ["approved", "builder", "age_block"] }).notNull(),
  reasonKey: text("reason_key"),
  actualValue: integer("actual_value"),
  requiredValue: integer("required_value"),
  offeredLimit: integer("offered_limit"),
  offerRaw: numeric("offer_raw", { precision: 12, scale: 2, mode: "number" }),
  offerClampedBy: text("offer_clamped_by"),
  computedAt: createdAt(),
  computedOn: day("computed_on").notNull(),
  recheckAt: day("recheck_at"),
});

// ---------- the credit line ----------
export const creditLines = pgTable("credit_lines", {
  id: id(),
  userId: userId().unique(),
  offeredLimit: integer("offered_limit").notNull(),
  chosenLimit: integer("chosen_limit").notNull(),
  baseLimit: integer("base_limit").notNull(),
  currentLimit: integer("current_limit").notNull(),
  status: text("status", { enum: ["pending", "cooling_off", "active", "paused", "frozen", "recovery", "closed", "graduated"] }).notNull(),
  tier: integer("tier").notNull().default(1),
  autopayOn: boolean("autopay_on").notNull().default(true),
  payday: integer("payday"),
  dueDay: integer("due_day"),
  kfsVersion: integer("kfs_version"),
  kfsAcceptedAt: timestamp("kfs_accepted_at", { withTimezone: true }),
  coolingOffUntil: day("cooling_off_until"),
  /** Comeback after a slip: the limit to restore once comeback_cycles clean cycles are done. */
  comebackRestoreLimit: integer("comeback_restore_limit"),
  selfFrozen: boolean("self_frozen").notNull().default(false),
  /** The daily job has processed every day up to and including this one. */
  lastProcessedOn: day("last_processed_on"),
  /** Demo tool: the next autopay attempt fails. */
  forceAutopayFail: boolean("force_autopay_fail").notNull().default(false),
  createdAt: createdAt(),
});

export const kfsDocuments = pgTable("kfs_documents", {
  id: id(),
  userId: userId(),
  version: integer("version").notNull(),
  jsonSnapshot: jsonb("json_snapshot").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const cycles = pgTable(
  "cycles",
  {
    id: id(),
    userId: userId(),
    lineId: uuid("line_id").notNull().references(() => creditLines.id, { onDelete: "cascade" }),
    n: integer("n").notNull(),
    startDate: day("start_date").notNull(),
    endDate: day("end_date").notNull(),
    dueDate: day("due_date").notNull(),
    status: text("status", { enum: ["open", "billed", "settled"] }).notNull().default("open"),
    statementAmount: integer("statement_amount"),
    paidAmount: integer("paid_amount").notNull().default(0),
    paidAt: day("paid_at"),
    onTime: boolean("on_time"),
    dpdMax: integer("dpd_max").notNull().default(0),
    spendTotal: integer("spend_total").notNull().default(0),
    slipStep: integer("slip_step").notNull().default(0),
    reported: boolean("reported").notNull().default(false),
    nudged: boolean("nudged").notNull().default(false),
  },
  (t) => [uniqueIndex("cycle_line_n").on(t.lineId, t.n)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: userId(),
    lineId: uuid("line_id").notNull().references(() => creditLines.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull().references(() => cycles.id, { onDelete: "cascade" }),
    merchant: text("merchant").notNull(),
    category: text("category").notNull(),
    amount: integer("amount").notNull(),
    bigSpendConfirmed: boolean("big_spend_confirmed").notNull().default(false),
    spentOn: day("spent_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("txn_cycle_idx").on(t.cycleId)],
);

export const repayments = pgTable("repayments", {
  id: id(),
  userId: userId(),
  cycleId: uuid("cycle_id").references(() => cycles.id, { onDelete: "cascade" }),
  hardshipPlanId: uuid("hardship_plan_id"),
  amount: integer("amount").notNull(),
  method: text("method", { enum: ["autopay", "manual", "hardship"] }).notNull(),
  status: text("status", { enum: ["success", "failed"] }).notNull(),
  paidOn: day("paid_on").notNull(),
  createdAt: createdAt(),
});

export const slipEvents = pgTable(
  "slip_events",
  {
    id: id(),
    userId: userId(),
    lineId: uuid("line_id").notNull().references(() => creditLines.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull().references(() => cycles.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    enteredOn: day("entered_on").notNull(),
    actionsJson: jsonb("actions_json").notNull(),
  },
  (t) => [uniqueIndex("slip_once").on(t.cycleId, t.step)],
);

export const hardshipPlans = pgTable("hardship_plans", {
  id: id(),
  userId: userId(),
  lineId: uuid("line_id").notNull().references(() => creditLines.id, { onDelete: "cascade" }),
  principal: integer("principal").notNull(),
  apr: numeric("apr", { precision: 6, scale: 2, mode: "number" }).notNull(),
  months: integer("months").notNull(),
  scheduleJson: jsonb("schedule_json").notNull(),
  totalInterest: integer("total_interest").notNull(),
  ascendRevenue: integer("ascend_revenue").notNull().default(0),
  paidInstalments: integer("paid_instalments").notNull().default(0),
  status: text("status", { enum: ["active", "completed", "cancelled"] }).notNull().default("active"),
  startedOn: day("started_on").notNull(),
  createdAt: createdAt(),
});

export const rewards = pgTable("rewards", {
  id: id(),
  userId: userId(),
  cycleId: uuid("cycle_id").references(() => cycles.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

export const ladderEvents = pgTable("ladder_events", {
  id: id(),
  userId: userId(),
  lineId: uuid("line_id").notNull().references(() => creditLines.id, { onDelete: "cascade" }),
  fromLimit: integer("from_limit").notNull(),
  toLimit: integer("to_limit").notNull(),
  reason: text("reason").notNull(),
  createdOn: day("created_on").notNull(),
  createdAt: createdAt(),
});

export const moments = pgTable(
  "moments",
  {
    id: id(),
    userId: userId(),
    trigger: text("trigger").notNull(),
    key: text("key").notNull(),
    payload: jsonb("payload").notNull(),
    shownAt: timestamp("shown_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("moment_once").on(t.userId, t.key)],
);

export const familyLinks = pgTable("family_links", {
  id: id(),
  userId: userId(),
  token: text("token").notNull().unique(),
  showAttentionFlag: boolean("show_attention_flag").notNull().default(false),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
});

export const notifications = pgTable("notifications", {
  id: id(),
  userId: userId(),
  channel: text("channel").notNull(),
  template: text("template").notNull(),
  payload: jsonb("payload").notNull(),
  sentOn: day("sent_on").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------- lender side ----------
export const revenueLedger = pgTable("revenue_ledger", {
  id: id(),
  userId: userId(),
  lineId: uuid("line_id").notNull().references(() => creditLines.id, { onDelete: "cascade" }),
  // No late-fee type exists, so late-fee revenue cannot be recorded.
  type: text("type", { enum: ["interchange", "healthy_account_fee", "graduation_fee"] }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
  createdAt: createdAt(),
});

export const dlgLedger = pgTable("dlg_ledger", {
  id: id(),
  userId: userId(),
  cohort: text("cohort").notNull(),
  lineId: uuid("line_id").notNull().references(() => creditLines.id, { onDelete: "cascade" }).unique(),
  amountCovered: integer("amount_covered").notNull(),
  invokedOn: day("invoked_on").notNull(),
});

export const cohortFlags = pgTable("cohort_flags", {
  cohort: text("cohort").primaryKey(),
  brakeState: text("brake_state", { enum: ["none", "brake", "stop"] }).notNull().default("none"),
  dpdPct: numeric("dpd_pct", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  /** Demo tool: extra DPD percentage points added to show the brake. 0 outside demos. */
  injectedDpdPct: numeric("injected_dpd_pct", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const grievances = pgTable("grievances", {
  id: id(),
  userId: userId(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** Payees created on /test-merchant, so a QR can be scanned in the UPI sandbox. */
export const testMerchants = pgTable("test_merchants", {
  id: id(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  amount: integer("amount"),
  createdAt: createdAt(),
});
