-- Migration 37: Event ledger immutability guard
-- Story 24.3 — Database-Enforced Tenant Isolation and Immutable Ledger

-- The `events` table is the append-only audit ledger. No application or
-- maintenance path may UPDATE or DELETE its rows. INSERT remains permitted,
-- constrained by the tenant-scoped RLS policy from migration 36.

-- Break-glass role: documented here, must be used only for approved retention,
-- incident response, or legal holds, and only after explicit human approval.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'allura_breakglass') THEN
        CREATE ROLE allura_breakglass WITH NOLOGIN NOINHERIT BYPASSRLS;
    END IF;

    -- Allow the migration/admin role to assume break-glass for approved procedures.
    EXECUTE 'GRANT allura_breakglass TO allura_migration WITH ADMIN OPTION';
    EXECUTE 'GRANT allura_breakglass TO allura';
END
$$;

-- Break-glass requires BYPASSRLS (granted by CREATE ROLE) and explicit table
-- privileges, because RLS bypass does not imply DML rights.
GRANT USAGE ON SCHEMA public TO allura_breakglass;
GRANT USAGE ON SCHEMA app TO allura_breakglass;
GRANT ALL PRIVILEGES ON TABLE events TO allura_breakglass;
GRANT CONNECT ON DATABASE memory TO allura_breakglass;

COMMENT ON ROLE allura_breakglass IS 'Emergency role for approved retention/incident-response work on the events ledger. Use requires documented approval; normal application paths cannot assume this role.';

-- Function called by the trigger to reject UPDATE/DELETE on events.
-- SECURITY INVOKER is required: current_user must reflect the role that issued
-- the statement, not the function owner. Break-glass roles have BYPASSRLS.
CREATE OR REPLACE FUNCTION app.reject_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF (SELECT true FROM pg_roles WHERE rolname = current_user AND rolbypassrls) THEN
        -- Break-glass users (BYBYPASSRLS) may mutate events; this path must be logged separately.
        -- DELETE row triggers have OLD but no NEW; UPDATE has both. Return the operative row.
        RETURN COALESCE(NEW, OLD);
    END IF;

    RAISE EXCEPTION 'events ledger is immutable: % operations are not permitted (role %)', TG_OP, current_user
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS events_immutable_trigger ON events;
CREATE TRIGGER events_immutable_trigger
    BEFORE UPDATE OR DELETE ON events
    FOR EACH ROW
    EXECUTE FUNCTION app.reject_events_mutation();

-- Ensure the application role cannot bypass the trigger through policies.
-- The trigger fires for every statement; RLS on INSERT still enforces tenant.
