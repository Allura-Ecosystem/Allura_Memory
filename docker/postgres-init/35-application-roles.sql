-- Migration 35: Application and migration database roles
-- Story 24.3 — Database-Enforced Tenant Isolation and Immutable Ledger

DO $$
DECLARE
    db_name text := current_database();
BEGIN
    -- Schema for helper functions used by RLS / immutability triggers.
    CREATE SCHEMA IF NOT EXISTS app;

    -- Application role: used by the running Allura service. It must not own the
    -- schema so that RLS is enforced; it has no break-glass privileges.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'allura_app') THEN
        CREATE ROLE allura_app WITH LOGIN PASSWORD 'change-me-in-production' NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;

    -- Migration role: used by CI/deployment tooling. Same owner power as the
    -- bootstrap user (allura), but named explicitly for audit.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'allura_migration') THEN
        CREATE ROLE allura_migration WITH LOGIN PASSWORD 'change-me-in-production' NOINHERIT NOREPLICATION BYPASSRLS;
    END IF;

    -- Grant schema usage to helper functions after roles exist.
    GRANT USAGE ON SCHEMA app TO allura_app;
    GRANT USAGE ON SCHEMA app TO allura_migration;

    -- Grant connect to the database.
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO allura_app', db_name);
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO allura_migration', db_name);

    -- Schema usage required for both roles.
    GRANT USAGE ON SCHEMA public TO allura_app;
    GRANT USAGE ON SCHEMA public TO allura_migration;

    -- The migration role can create/alter objects; the app role cannot.
    GRANT CREATE ON SCHEMA public TO allura_migration;
END
$$;

-- Note: table privileges are granted in migration 36 after RLS is set, because
-- policies must exist before the app role is given DML access.
