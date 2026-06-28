-- 30-memberships-ac6-extend.sql
-- AC6: FaithMeats / Cloudflare Access identity extension for the memberships table.
-- Additive only — no DROP TABLE, no TRUNCATE, no DELETE, no destructive DML.
--
-- CONTEXT:
-- Migration 29 created the memberships table for the Allura Hosted Platform
-- with Clerk auth (user_id = stable Clerk id, email nullable, roles:
-- admin/curator/viewer). AC6 extends this table for the FaithMeats
-- self-hosted deployment where Cloudflare Access is the identity provider
-- (email IS the stable, immutable identifier; no Clerk user_id).
--
-- CHANGES IN THIS MIGRATION:
--   1. Add is_default BOOLEAN — which tenant to use when the client omits
--      group_id in a request (AC6 Rule 4.1.2).
--   2. Extend role CHECK — add 'owner' (can provision/revoke) and 'member'
--      (read/write per tenant policy) to the existing ('admin','curator','viewer').
--   3. Add email lookup index — fast lookup by email for getMembershipsForEmail.
--   4. Add UNIQUE(email, group_id) partial index — enforces one row per
--      CF-Access-identity per tenant.
--   5. Seed initial memberships — FaithMeats team (3 tenants owned by
--      sasheed@faithmeats.com, 2 employees in allura-faithmeats).
--
-- MUTABILITY POLICY (Brooks Nit — overrides ADR §3.2 INSERT-only claim):
-- memberships is a current-state config table, NOT append-only. Role
-- changes UPDATE role + updated_at; removal is a soft-delete via removed_at.
-- The append-only invariant (POL-002) is preserved in the events table via
-- audit events (membership_added / membership_role_changed / membership_removed)
-- emitted by src/lib/membership/repository.ts. This table stores the CURRENT
-- state; events stores the immutable HISTORY. Two different contracts,
-- intentionally separated.
--
-- CF ACCESS PATTERN:
-- For Cloudflare Access users, user_id = email (email IS the stable identity;
-- CF Access guarantees the email claim is tied to the verified identity).
-- This means both user_id and email columns hold the same value, so lookups
-- by either column are equivalent on these rows.
--
-- Idempotent: safe to re-run. All DDL uses IF NOT EXISTS / existence guards.

-- ── 1. Add is_default column ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'memberships'
       AND column_name  = 'is_default'
  ) THEN
    ALTER TABLE memberships
      ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ── 2. Extend role CHECK to include 'owner' and 'member' ─────────────────────
-- Drop the existing inline CHECK named 'memberships_role_check' (PostgreSQL
-- auto-generated name from the v29 inline CHECK clause), then replace it with
-- a named constraint that includes the two new AC6 roles.
DO $$
BEGIN
  -- Drop old role check if it still exists under the auto-generated name
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'memberships'::regclass
       AND conname  = 'memberships_role_check'
  ) THEN
    ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
  END IF;

  -- Add extended named constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'memberships'::regclass
       AND conname  = 'chk_memberships_role'
  ) THEN
    ALTER TABLE memberships
      ADD CONSTRAINT chk_memberships_role
        CHECK (role = ANY (ARRAY[
          'admin'::text,
          'curator'::text,
          'viewer'::text,
          'owner'::text,
          'member'::text
        ]));
  END IF;
END $$;

-- ── 3. Email lookup index (fast getMembershipsForEmail queries) ───────────────
-- Partial: only index rows that actually have an email (Clerk-path rows may
-- have email = NULL in edge cases).
CREATE INDEX IF NOT EXISTS idx_memberships_email
    ON memberships (email)
    WHERE email IS NOT NULL;

-- ── 4. UNIQUE(email, group_id) for CF Access email-identity path ──────────────
-- Partial unique index: enforces at most one active membership per
-- (email, tenant). Does not conflict with the existing UNIQUE(group_id, user_id)
-- which covers the Clerk-path. Partial (WHERE email IS NOT NULL) so Clerk-path
-- rows without email are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_email_group_id
    ON memberships (email, group_id)
    WHERE email IS NOT NULL;

-- ── 5. Seed: FaithMeats / AC6 initial memberships ────────────────────────────
-- CORRECTED OWNER EMAIL: sasheed@faithmeats.com (Cloudflare Access
-- FaithMeats identity). The ADR §3.3 draft listed sasheed72@gmail.com in
-- error — that Gmail is the personal identity used for the personal tenant
-- (allura-personal), NOT the FaithMeats CF Access identity. The correct
-- business identity authenticating via FaithMeats Cloudflare Access is
-- sasheed@faithmeats.com.
--
-- allura-system is intentionally NOT seeded here (AC6 Rule 4.1.3:
-- human access to allura-system is permanently forbidden).
--
-- ON CONFLICT targets (group_id, user_id) — the existing unique index.
-- For CF Access rows: user_id = email (email is the stable id).
-- Re-running this migration is safe: it upserts without changing already-set
-- values that differ only in updated_at.

INSERT INTO memberships (group_id, user_id, email, role, is_default)
VALUES
  -- Sabir Asheed: owner of all three human tenants
  -- Default = allura-faithmeats (the live business tenant)
  ('allura-faithmeats',        'sasheed@faithmeats.com',  'sasheed@faithmeats.com',  'owner', true),
  ('allura-difference-driven', 'sasheed@faithmeats.com',  'sasheed@faithmeats.com',  'owner', false),
  ('allura-personal',          'sasheed@faithmeats.com',  'sasheed@faithmeats.com',  'owner', false),

  -- FaithMeats employees: admin access to allura-faithmeats only
  -- They have no access to allura-difference-driven or allura-personal
  ('allura-faithmeats',        'gabec@faithmeats.com',    'gabec@faithmeats.com',    'admin', true),
  ('allura-faithmeats',        'samuel.m@faithmeats.com', 'samuel.m@faithmeats.com', 'admin', true)

ON CONFLICT (group_id, user_id) DO UPDATE
  SET role       = EXCLUDED.role,
      email      = EXCLUDED.email,
      is_default = EXCLUDED.is_default,
      updated_at = NOW();

-- ── Schema version tracking ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '030',
    NOW(),
    'AC6: extend memberships — add is_default, extend role CHECK (owner/member), email indexes, seed FaithMeats team (sasheed@faithmeats.com owner; gabec + samuel.m admin)'
) ON CONFLICT (version) DO NOTHING;
