# Ascend

A small UPI credit line for students, built for CaseBlitz 2026. Students are approved on how money
flows into their bank account (not on a credit score they don't have yet), get a limit of a share of
that inflow, and grow it only by paying on time.

**Golden rule:** nothing is hard-coded. Every name, number, date, limit, fee and outcome comes from
(a) what the user enters or uploads, (b) the engines computing from that data, or (c) the editable
`config` table. The seed script inserts config rows only, never users or transactions.

> Northbridge Bank is a fictional lender. KYC, Account Aggregator, bureau, UPI and AutoPay run as
> clearly-labelled **sandbox** providers that work only on data the user supplies.

## Live demo

**https://ascend-three-tan.vercel.app** (hosted on Vercel, database on Supabase)

- **Students:** click *Get started*, enter any email, and use the sign-in code shown on screen
  (sandbox, no real email is sent). KYC accepts any 12-digit Aadhaar and any 10-character PAN.
- **Parents:** `/parents` (English and हिंदी) and the read-only `/family/<token>` link a student shares.
- **Sandbox shop:** `/test-merchant` makes a QR you can pay from your Ascend line.
- Code: https://github.com/SoAkeD1/ASCEND

---

## How the code is organised

```
lib/engine/      Pure business logic. No database, no UI. Every rule passed in from config.
                 inflow · statementCsv · underwriting · limit · ladder · cycle · slipLadder ·
                 hardship · kfs · rewards · riskBrake · revenue · moments · score · dates
lib/config/      The config schema (Zod) and the loader that reads the config table
lib/db/          Drizzle table definitions, the connection, and withActor (row-level security)
lib/services/    Glue: read rows → call engines → write rows. One file per area
                 onboarding · line · daily (the cron) · family · lender · admin · account · view
lib/api/         registry.ts lists EVERY action: who may call it + its Zod input schema
lib/providers/   Provider adapters (sandbox now, real later): OTP, KYC, UPI, AutoPay
app/             Pages (Next.js App Router) and the API routes
components/      React components rebuilt from the design export
db/              Migrations (SQL), the config seed, and the setup script
tests/           Vitest tests. Fixtures live ONLY here
i18n/            English and Hindi text for /parents
```

A request flows like this: **page or API route → service → engine(s) → database**. The engines never
touch the database, which is why they can be tested with plain numbers.

### Security model

- **Row Level Security.** Every request runs inside `withActor()` (`lib/db/actor.ts`), which opens a
  transaction, switches to the restricted `ascend_app` database role, and sets `app.user_id` and
  `app.role`. Policies in `db/migrations/0001_rls.sql` then let a student see only their own rows.
  Staff (lender/admin) and the daily job see all rows. `tests/db/rls.test.ts` proves it.
- **Sign-in.** Email one-time codes. Codes are stored as an HMAC hash, expire in 10 minutes, allow 5
  tries, and are rate-limited per email and per IP (`lib/auth`). Sessions are a signed JWT in an
  httpOnly cookie.
- **Data minimisation.** Only the last 4 characters of PAN and Aadhaar are stored. Bank statement files
  are discarded after parsing unless the user ticks "keep my file". Under-18 sign-ups keep nothing but
  the come-back date. "Delete my data" wipes personal data and keeps anonymised loan records.
- **No device permissions.** The app never asks for contacts, photos, SMS or location; the
  `Permissions-Policy` header blocks them.
- **Audit log.** Consent changes, KFS acceptance, limit changes, slip steps, config edits and demo
  actions are written to `audit_log`.
- **Family View** (`/family/[token]`) can only render the fields in `FamilyView`
  (`lib/services/family.ts`): first name, payment status, streak, ladder progress and score stage. No
  amounts, merchants or transactions, and revoking a link kills it at once.

### Decisions worth knowing (and defending)

| Decision | Why |
|---|---|
| Own email-OTP sign-in instead of Supabase Auth | Development and tests run with no external account; Supabase is used as the Postgres database. |
| PGlite locally, Supabase Postgres in production | Same SQL and same security policies everywhere; nothing to install for local development. |
| The daily job replays each day one at a time | Makes demo time travel exact: jumping 40 days runs all 40 days of cycle closes, AutoPay attempts and slip steps. |
| Paying inside grace (step 3) keeps your limit; paying later starts a comeback | Grace means "₹0 fee, no punishment". Past grace the limit drops to `limit_min` and `comeback_cycles` clean cycles restore it. |
| A ₹0 statement counts as on time | Nothing was owed, so nothing was missed. |
| The risk brake has a hold zone | Between `dpd_target_pct` and `brake_pct` the current state is kept, so it doesn't flicker. `stop` also pauses new spends for that cohort. |
| A due date is at least `reminder_before_days` after the statement | So the "due soon" reminder can never arrive before the bill exists. |
| Config keys added beyond the brief | `min_age`, `bounce_keywords`, `interchange_pct`, `healthy_account_fee`, `graduation_fee`, `grievance_escalation_days`. All editable in Admin. |

---

## Run it locally

Needs Node.js 20 or newer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `SESSION_SECRET` (any random string of 32+ characters), put your email in `ADMIN_EMAILS`, and
set `DEMO_MODE=true` if you want the demo tools. Then create the local database and start the app:

```bash
npm run db:setup
```

```bash
npm run dev
```

Open http://localhost:3000. With `OTP_PROVIDER=sandbox`, the sign-in code is shown on screen with a
"Sandbox · simulated provider" tag.

Run the tests (122 of them: every engine, the security policies and a full user journey):

```bash
npm test
```

## Deploy (Supabase + Vercel)

1. **Supabase:** create a project. Copy the connection string from Project Settings → Database →
   Connection string → *Transaction pooler* (port 6543).
2. **Create the tables and config** from your computer, pointing at Supabase:
   `DATABASE_URL="postgres://…" npm run db:setup`
3. **Vercel:** import this folder as a project. Add the environment variables from `.env.example`
   (`DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAILS`, `DEMO_MODE`, and optionally
   `APP_URL`, `OTP_PROVIDER`/`RESEND_API_KEY`/`EMAIL_FROM` for real emails).
4. Deploy. `vercel.json` schedules `/api/cron/daily` once a day.

## Demo mode

With `DEMO_MODE=true`, the Admin page (`/admin`) adds:

- **Create test user:** type any name, date of birth, monthly inflows, bounce yes/no and overdue loan.
  Nothing is pre-filled; the user goes through the real engines.
- **Time travel per user:** +1 day, +1 cycle, jump to the due date, or jump to any days-past-due.
- **Force AutoPay failure**, **mark paid**, **inject DPD into a cohort** (to show the risk brake),
  **reset demo data** (deletes only users made with "Create test user").
- **Open as user:** view the app as a demo user; signing out returns to Admin.

---

## Every library, API and dataset used

**Runtime libraries**

| Library | Version | Used for |
|---|---|---|
| Next.js | 14.2.35 | Web framework (App Router, server components, API routes) |
| React / React DOM | 18 | UI |
| Drizzle ORM | 0.45 | Type-safe SQL queries and table definitions |
| postgres (postgres.js) | 3.4 | Postgres driver for production (Supabase) |
| @electric-sql/pglite | 0.5 | Postgres compiled to WebAssembly for local development and tests |
| Zod | 4 | Validates every API input and every config value |
| jose | 6 | Signs and verifies the session token (JWT, HS256) |
| qrcode | 1.5 | QR codes on the `/test-merchant` sandbox page |

**Development libraries:** TypeScript 5, Tailwind CSS 3.4, PostCSS 8, ESLint 8 with
eslint-config-next, Vitest 2 (tests), drizzle-kit 0.31 (generates SQL migrations), tsx 4 (runs the
setup script), and the @types packages for Node, React and qrcode.

**Fonts:** Inter, from Google Fonts via `next/font`.

**Services and APIs**

| Service | Status | Used for |
|---|---|---|
| Supabase (Postgres) | Production database | All data, with Row Level Security |
| Vercel + Vercel Cron | Hosting | Runs the app and the daily job |
| Resend email API | Optional (`OTP_PROVIDER=resend`) | Sends sign-in codes by email |
| Twilio SMS API | Optional (`AUTH_CHANNEL=sms`, `OTP_PROVIDER=twilio`) | Sends sign-in codes by SMS |
| WhatsApp share link (`wa.me`) | Link only, no API key | Lets a student share the parent explainer or Family View link |
| DigiLocker, Account Aggregator, credit bureau, NPCI UPI, UPI AutoPay | **Sandbox adapters only** | Simulated on user-supplied data and labelled as such |

**Datasets:** none. The app holds only data its users enter or upload. Test fixtures live in `tests/`.
