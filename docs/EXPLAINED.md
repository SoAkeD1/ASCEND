# Ascend, explained in plain words

A guide for presenting and defending the build. Each section says what happens, where the code is,
and how we know it works.

## 1. The big idea in one paragraph

A student signs up, proves who they are, and shares a bank statement. We look at how much money comes
in each month, and if they pass two simple checks we offer a small credit limit worth a fixed share of
that money. They spend with UPI, and the whole bill is due once a cycle. Paying on time costs nothing
and slowly raises their limit. Paying late never costs a fee; instead spends pause, and there is a fair
plan if they're stuck.

## 2. Three layers (the most important design decision)

| Layer | Folder | What it does | Can it touch the database? |
|---|---|---|---|
| **Engines** | `lib/engine` | The maths and rules: "given these numbers, what's the answer?" | No |
| **Services** | `lib/services` | Fetch rows, call engines, save the results | Yes |
| **Screens / API** | `app`, `components` | Show results, collect input | Only through services |

**Why it matters:** the engines are pure functions, so they can be tested with plain numbers and no
database. That is why there are 100+ engine tests that run in about one second.

## 3. Where every rule lives

All rules (limit %, minimum inflow, grace days, fees, ladder steps…) are rows in the **`config`** table.
The engines receive them as an input; there are no numbers typed into the code.

- See it: Admin page → "Business rules". Change `limit_pct` from 25 to 20 and the next decision uses 20%.
- Proof: tests named "changing a config value changes … without code changes".
- The only place default values exist is `db/seed-config.ts`, which runs once to fill the table.

## 4. The journey, step by step

| Step | What happens | Engine / service |
|---|---|---|
| Sign up | Email → 6-digit code → signed cookie | `lib/auth/otp.ts`, `lib/auth/session.ts` |
| Profile | Name + date of birth. Under `min_age` → come-back date; nothing else kept | `engine/underwriting.ts` `ageCheck` |
| KYC | PAN + Aadhaar format check (Aadhaar checksum too). Only the last 4 characters are stored | `providers/sandbox.ts` |
| Consent | KYC, AA and bureau switches, all off by default, each with a purpose | `services/onboarding.ts` `setConsent` |
| Gate 1 | Self-declared bureau status. Active unpaid loan → Builder | `engine/underwriting.ts` |
| Gate 2 | Bank CSV or typed monthly totals → average inflow, months of history, last bounce, payday | `engine/statementCsv.ts`, `engine/inflow.ts` |
| Offer | `clamp(round_down(inflow × limit_pct%), min, max)`; the user can pick lower, never higher | `engine/limit.ts` |
| KFS | Every fee, slip step and hardship example built from config + the user's limit; frozen as a snapshot when accepted | `engine/kfs.ts` |
| AutoPay | Due day = payday + offset. Line opens in cooling-off | `services/onboarding.ts` `activateLine` |

## 5. Living with the line

- **Cycle:** `cycle_length_days` long. When it closes, the spend becomes the statement (`engine/cycle.ts`).
- **The daily job** (`services/daily.ts`) walks each line forward one day at a time. It closes cycles,
  tries AutoPay on the due date, retries on payday, and moves through the slip steps.
  *Why day by day?* So time travel in the demo is exact: jumping 40 days replays 40 real days.
- **On time** means paid in full by the due date. **The repayment record** (`repaymentHistory`) lists
  cycles in order. ₹0 cycles are neutral (you can't build a record by not borrowing), and an overdue
  bill counts as a miss straight away.
- **Ladder:** consecutive on-time cycles reaching a configured rung raise the limit. It's blocked if the
  cohort brake is on, the line isn't active, or inflow has dropped (`engine/ladder.ts`).
- **Cashback** depends on the tier, never on how much you spend (`engine/rewards.ts`).

## 6. When a payment slips (the 6 steps)

The step is a pure function of *today*, *the due date* and *whether money is unpaid*
(`engine/slipLadder.ts`). Running it twice gives the same answer, which is what "idempotent" means.

1 Reminder → 2 AutoPay → 3 Grace (spends pause, ₹0 fee) → 4 Weekly reminders, reported to the bureaus at
day 30 → 5 Freeze, hardship plan offered → 6 Partner bank's regulated recovery.

**Hardship plan** (`engine/hardship.ts`): the standard loan EMI formula. Each instalment is rounded to the
rupee and the rounding difference goes into the last one, so the total is exact. Ascend's share of the
interest comes from config and is 0. Tested for many amounts and both month options.

**Comeback:** paying inside grace keeps your limit. Paying later drops it to the minimum, and
`comeback_cycles` clean cycles restore it.

## 7. Safety and privacy, and how to prove each claim

| Claim | Where | Proof |
|---|---|---|
| A student can never read another student's data | `db/migrations/0001_rls.sql`, `lib/db/actor.ts` | `tests/db/rls.test.ts` |
| Parents never see amounts or shops | `services/family.ts` `FamilyView` type | journey test checks the output has no amount fields |
| Late-fee revenue is impossible | `revenue_ledger.type` has no late-fee value | revenue test and the lender dashboard row |
| Sign-in codes can't be guessed or read | Hashed, 10-minute expiry, 5 tries, rate limits | `lib/auth/otp.ts` |
| No contacts/photos/SMS/location | Never requested; a browser header blocks them | `next.config.mjs` |
| Every important change is recorded | `audit_log` | Admin page → audit log |

## 8. Lender view and the risk brake

`services/lender.ts` computes everything from the rows on every page load:
- the Credit-Ready Rate
- 30+ DPD weighted by money owed
- first-payment default
- AutoPay adoption
- the approval funnel
- revenue by type
- default-loss-guarantee use against its cap

The **brake** (`engine/riskBrake.ts`) has a hold zone so it doesn't flicker:
- At or above `brake_pct`: brake.
- At or above `stop_pct`: stop.
- Below `dpd_target_pct`: released.
- In between: the current state stays.

## 9. Likely judge questions

- **"Isn't this just hard-coded for the demo?"** No. Grep the code for any sample name or amount: there
  are none. Create a test user with any numbers on the Admin page and watch the real engines decide.
- **"What if a student never spends?"** Their record doesn't grow: ₹0 cycles are neutral, as they are
  for real bureaus.
- **"How do you stop a student owing too much?"** The limit is a share of real inflow, there are no
  minimum-due payments, and spends pause the day after a missed due date.
- **"What's simulated?"** KYC, Account Aggregator, bureau, UPI and AutoPay are sandbox adapters with the
  same shape a real provider would have, and every sandbox screen is labelled. The database, decisions,
  security and maths are real.
- **"Why not Supabase Auth?"** It would tie development and tests to an external account. We still use
  Supabase as the production database, with the same security policies.
