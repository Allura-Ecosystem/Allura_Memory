-- Migration 51: security_invoker hardening for pre-existing views over
-- FORCE ROW LEVEL SECURITY tables.
--
-- SECURITY (AC-19 gate finding, out of Story 26.7's own scope): a plain
-- PostgreSQL view defaults to security_invoker = false, which means the view
-- body executes with the OWNER's privileges and RLS context, NOT the
-- querying role's. Migration 50 (bumblebee-current-state-views.sql) already
-- documents and fixes this for the three Bumblebee current-state views it
-- introduces, by declaring them WITH (security_invoker = true) at CREATE
-- time. This migration closes the same gap for the six views that predate
-- that fix and were never revisited:
--
--   - brooks_decisions               (10-brooks-tracking.sql)
--   - brooks_metrics                 (10-brooks-tracking.sql)
--   - brooks_session_timeline        (10-brooks-tracking.sql)
--   - brooks_confidence_distribution (10-brooks-tracking.sql)
--   - brooks_principles_applied      (10-brooks-tracking.sql)
--   - skill_usage_summary            (32-skill-usage-events.sql)
--
-- All six are built over `events` (brooks_*) or `skill_usage_events`
-- (skill_usage_summary). Both base tables carry FORCE ROW LEVEL SECURITY --
-- `events` at 39-workspace-subgraph-foundation.sql:147 and again at
-- 40-workspace-subgraph-forward-upgrade.sql:497; `skill_usage_events` via the
-- dynamic per-table loop in 36-tenant-rls.sql (it is listed in that
-- migration's `tenant_tables` array and picks up FORCE ROW LEVEL SECURITY +
-- the tenant_isolation_policy exactly like every other table in that array).
-- These views are created by the migration-applying role (allura /
-- allura_migration), which carries BYPASSRLS -- so without an explicit
-- override, FORCE ROW LEVEL SECURITY on the base table is silently bypassed
-- the moment access goes through one of these views, for ANY caller,
-- regardless of that caller's own privileges. This was proven live on a
-- disposable PG16 container: with a foreign tenant's app.current_group_id
-- set, a view over an RLS-protected table returned another tenant's rows;
-- with no tenant context set at all, the base table correctly returned 0
-- rows while the view returned 2. See
-- src/__tests__/view-security-invoker-hardening.e2e.test.ts for the
-- equivalent proof against these six views.
--
-- WHY ALTER VIEW ... SET, NOT AN EDIT TO MIGRATIONS 10 / 32:
-- Migrations 10 and 32 are already applied in every deployed database.
-- Editing an applied migration file in place is itself a drift hazard in
-- this repo -- a fresh deploy would re-run the edited file and get the
-- fixed view, but a database that already ran the original migration 10/32
-- would never see the edit at all (postgres-init scripts do not re-run
-- against an initialized data directory, and this repo has no forward
-- migration runner that diffs and re-applies changed migration bodies).
-- `ALTER VIEW ... SET (security_invoker = true)` is the correct forward-only,
-- surgical tool for this: it is a metadata-only change to an
-- already-defined view (no DROP/CREATE, no dependent-object churn, no
-- re-grant needed since the view's OID and ACL are untouched) and is valid
-- syntax against any already-applied deployment. Confirmed against the
-- PostgreSQL 15+ ALTER VIEW grammar: `ALTER VIEW name SET ( security_invoker
-- [= value] [, ...] )` is exactly the reloption-set form, no view body
-- redefinition required. This migration is idempotent -- re-running it after
-- security_invoker is already true is a no-op.
--
-- SHOULD MIGRATIONS 10 AND 32 *ALSO* BE FIXED SO A FRESH DEPLOY NEVER
-- CREATES A LEAKY VIEW IN THE FIRST PLACE? Deliberately left untouched here;
-- see the accompanying report for the full both-ways argument. Short
-- version: this repo's postgres-init scripts run once, before PostgreSQL
-- opens for external connections, against an empty data directory (standard
-- docker-entrypoint-initdb.d semantics) -- so a fresh deploy executes 10,
-- 32, and 51 back-to-back with zero external traffic in between, and gets a
-- correctly-hardened view before anyone can query it either way. Editing
-- 10/32 buys no additional runtime safety for a fresh deploy, and buys
-- nothing at all for an already-deployed database (init scripts do not
-- re-run against an initialized volume) -- the only thing it would change is
-- whether a future reader skimming migration 10/32 in isolation copies a
-- correct or an incorrect view-security pattern. That documentation benefit
-- is real, but this repo has an explicit, hard-won rule against touching
-- already-applied migration files, precisely because of the drift class it
-- invites (git blame on 10/32 would no longer describe what any currently
-- deployed database is actually running). This migration is the sole fix
-- point; if a future contributor copies migration 10's CREATE VIEW pattern
-- for a new view, that is a code-review catch, not a reason to edit history.
BEGIN;

ALTER VIEW brooks_decisions SET (security_invoker = true);
ALTER VIEW brooks_metrics SET (security_invoker = true);
ALTER VIEW brooks_session_timeline SET (security_invoker = true);
ALTER VIEW brooks_confidence_distribution SET (security_invoker = true);
ALTER VIEW brooks_principles_applied SET (security_invoker = true);
ALTER VIEW skill_usage_summary SET (security_invoker = true);

COMMENT ON VIEW brooks_decisions IS 'All Brooks architectural decisions across all runtimes. security_invoker = true (migration 51): evaluates under the querying role''s own RLS context, not the (BYPASSRLS) view owner''s.';
COMMENT ON VIEW brooks_metrics IS 'Performance metrics: decision count, confidence, status by runtime. security_invoker = true (migration 51): evaluates under the querying role''s own RLS context, not the (BYPASSRLS) view owner''s.';
COMMENT ON VIEW brooks_session_timeline IS 'Timeline of Brooks decisions within each session. security_invoker = true (migration 51): evaluates under the querying role''s own RLS context, not the (BYPASSRLS) view owner''s.';
COMMENT ON VIEW brooks_confidence_distribution IS 'Quality distribution of Brooks decisions by confidence band. security_invoker = true (migration 51): evaluates under the querying role''s own RLS context, not the (BYPASSRLS) view owner''s.';
COMMENT ON VIEW brooks_principles_applied IS 'Brooksian principles applied in each session. security_invoker = true (migration 51): evaluates under the querying role''s own RLS context, not the (BYPASSRLS) view owner''s.';
COMMENT ON VIEW skill_usage_summary IS 'Aggregated usage metrics per skill per group: count, success rate, avg tokens, avg duration. security_invoker = true (migration 51): evaluates under the querying role''s own RLS context, not the (BYPASSRLS) view owner''s -- skill_usage_events carries FORCE ROW LEVEL SECURITY via migration 36''s tenant_tables loop.';

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('051', NOW(), 'security_invoker hardening for brooks_* and skill_usage_summary views over FORCE RLS tables (AC-19 gate finding)')
ON CONFLICT (version) DO NOTHING;

COMMIT;
