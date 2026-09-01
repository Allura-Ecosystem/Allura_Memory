-- Portfolio-only synthetic workspace fixture.
-- This runs only inside docker-compose.portfolio.yml's disposable local image.
-- It establishes the server-derived DevAuth scope so governed audit events can
-- satisfy events(group_id, workspace_id) foreign-key integrity. It does not
-- create proposals, memories, metrics, receipts, or production-like activity.
INSERT INTO workspaces (workspace_id, group_id, name)
VALUES ('workspace-allura', 'allura-system', 'Local portfolio demo workspace')
ON CONFLICT (workspace_id) DO UPDATE
SET group_id = EXCLUDED.group_id,
    name = EXCLUDED.name;
