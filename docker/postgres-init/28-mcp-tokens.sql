-- 28-mcp-tokens.sql
-- Allura Hosted Platform — Bumblebee MCP bearer tokens
-- Additive only — no DROP, no ALTER on existing tables.
--
-- SECURITY (DESIGN-BUMBLEBEE, AD-03): the raw token is NEVER stored. We store an
-- HMAC-SHA256 hash + a short display prefix. Lookup is by prefix, then a
-- constant-time hash compare (see src/lib/mcp-token/hash.ts).
--
-- TENANCY (ADR-001): group_id (org tenant boundary) + workspace_id (sub-scope) are
-- bound to the token at mint time and injected server-side by Bumblebee; the agent
-- can never override them. Scopes are least-privilege (@allura/rbac).

CREATE TABLE IF NOT EXISTS mcp_tokens (
    id           TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
    agent_name   TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    token_hash   TEXT NOT NULL,
    scopes       TEXT[] NOT NULL DEFAULT '{}',
    expires_at   TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_mcp_tokens_group_id_format
        CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$')
);

-- Prefix is the lookup key — must be unique so a single token resolves.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tokens_prefix
    ON mcp_tokens (token_prefix);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_group_workspace
    ON mcp_tokens (group_id, workspace_id);

-- Active (non-revoked) tokens per workspace — the common gateway lookup.
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_active
    ON mcp_tokens (group_id, workspace_id)
    WHERE revoked_at IS NULL;

-- ── Schema version tracking ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '028',
    NOW(),
    'Allura Hosted: mcp_tokens table (HMAC-SHA256 hash + prefix, scopes, expiry/revoke, group_id+workspace_id binding)'
) ON CONFLICT (version) DO NOTHING;
