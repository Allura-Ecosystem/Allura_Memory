-- Story 25.2a safe rollback for the non-destructive RLS remediation.
-- This intentionally rolls back only migration 39's restrictive workspace
-- policies. It never rewrites or drops heterogeneous pre-existing policies.
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON events;
DROP POLICY IF EXISTS workspace_scope_restrictive_policy ON canonical_proposals;
