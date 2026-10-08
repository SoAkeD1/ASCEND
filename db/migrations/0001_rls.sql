-- Row Level Security. Every app request runs `SET LOCAL ROLE ascend_app` inside a transaction and
-- sets app.user_id / app.role (see lib/db/actor.ts). Postgres then enforces "own rows only".
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ascend_app') THEN
    CREATE ROLE ascend_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT ascend_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ascend_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ascend_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ascend_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_staff() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.role', true), '') IN ('lender', 'admin', 'system') $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  -- Per-user tables: you see and change only your own rows; staff and the daily job see all.
  FOREACH t IN ARRAY ARRAY[
    'consents','kyc_records','statement_uploads','inflow_txns','bureau_checks','underwriting_decisions',
    'credit_lines','kfs_documents','cycles','transactions','repayments','slip_events','hardship_plans',
    'rewards','ladder_events','moments','family_links','notifications','revenue_ledger','dlg_ledger','grievances'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own_rows ON %I USING (user_id = app_uid() OR app_is_staff()) WITH CHECK (user_id = app_uid() OR app_is_staff())', t);
  END LOOP;

  -- System-only tables.
  FOREACH t IN ARRAY ARRAY['otp_codes','rate_limits'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY staff_only ON %I USING (app_is_staff()) WITH CHECK (app_is_staff())', t);
  END LOOP;

  -- Readable by everyone (rules are public, as is a cohort's brake banner); writable by staff only.
  FOREACH t IN ARRAY ARRAY['config','cohort_flags'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY read_all ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY staff_write ON %I FOR ALL USING (app_is_staff()) WITH CHECK (app_is_staff())', t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY own_row ON users USING (id = app_uid() OR app_is_staff()) WITH CHECK (id = app_uid() OR app_is_staff());
--> statement-breakpoint
-- Anyone may write an audit entry about their own action; only staff may read the log.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY audit_read ON audit_log FOR SELECT USING (app_is_staff());
--> statement-breakpoint
-- Sandbox payees on /test-merchant are public by design.
ALTER TABLE test_merchants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY open_sandbox ON test_merchants USING (true) WITH CHECK (true);
--> statement-breakpoint
-- On Supabase, close the auto-generated public REST API completely: the app talks to Postgres
-- only from the server, so the browser-facing roles get nothing.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
  END IF;
END $$;
