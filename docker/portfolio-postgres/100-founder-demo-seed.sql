-- Founder demo seed — disposable, Docker-only fixture data.
--
-- Runs only inside docker-compose.portfolio.yml's disposable local image,
-- immediately after 99-portfolio-demo-workspace.sql establishes the
-- `workspace-allura` / `allura-system` scope. That fixture intentionally
-- created a workspace row with NO activity ("no proposals, memories,
-- metrics, receipts, or production-like activity"), which meant every
-- founder-facing dashboard surface (Overview, Mission Control, Work Board,
-- Search, Teams, Graph) rendered a truthful but useless "no data" empty
-- state for founder review.
--
-- This file adds the minimum deterministic rows needed to populate those
-- surfaces, strictly inside the disposable `workspace-allura` scope, using
-- the real production schema and its FK/CHECK constraints. It never touches
-- any other workspace, never runs outside the portfolio compose stack, and
-- content is clearly labeled as synthetic so it cannot be mistaken for real
-- customer activity (src/app/dashboard/mission-control/page.tsx labels this
-- workspace as fixture data explicitly).
--
-- Idempotent: safe to re-run against the same disposable container.

-- ── Work Board (projects -> work_items) ─────────────────────────────────────

INSERT INTO projects (id, group_id, name, description, status)
VALUES ('proj-founder-demo', 'allura-system', 'Founder demo workspace', 'Disposable fixture project for founder review.', 'active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO work_items (id, project_id, group_id, title, description, status, priority, owner_id, updated_at)
VALUES
  ('wi-founder-demo-1', 'proj-founder-demo', 'allura-system', 'Ship founder demo seed', '[fixture] Populate the disposable founder demo workspace.', 'in_progress', 'high', 'founder-demo-agent', NOW() - INTERVAL '1 hour'),
  ('wi-founder-demo-2', 'proj-founder-demo', 'allura-system', 'Review dashboard copy', '[fixture] Editorial pass on Mission Control wording.', 'in_review', 'medium', 'founder-demo-agent', NOW() - INTERVAL '2 hours'),
  ('wi-founder-demo-3', 'proj-founder-demo', 'allura-system', 'Unblock Cloudflare Access scope', '[fixture] Waiting on tenant scope confirmation.', 'blocked', 'critical', 'founder-demo-agent', NOW() - INTERVAL '3 hours'),
  ('wi-founder-demo-4', 'proj-founder-demo', 'allura-system', 'Publish onboarding checklist', '[fixture] Ready for the next founder session.', 'backlog', 'low', 'founder-demo-agent', NOW() - INTERVAL '4 hours'),
  ('wi-founder-demo-5', 'proj-founder-demo', 'allura-system', 'Close out demo retro', '[fixture] Completed during the last founder walkthrough.', 'done', 'medium', 'founder-demo-agent', NOW() - INTERVAL '5 hours')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, status = EXCLUDED.status,
  priority = EXCLUDED.priority, owner_id = EXCLUDED.owner_id, updated_at = EXCLUDED.updated_at;

-- ── Mission Control / Teams (agent activity ledger) ─────────────────────────

-- events has no natural unique key beyond its surrogate BIGSERIAL id, so
-- guard the whole batch with a marker-row existence check to stay
-- deterministic if this script is ever re-applied against the same volume.
INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata, created_at)
SELECT * FROM (VALUES
  ('allura-system', 'workspace-allura', 'work_item_updated', 'woz', 'completed', '{"fixture": true, "work_item_id": "wi-founder-demo-1", "seed_marker": "founder-demo-seed-v1"}'::jsonb, NOW() - INTERVAL '55 minutes'),
  ('allura-system', 'workspace-allura', 'work_item_reviewed', 'pike', 'completed', '{"fixture": true, "work_item_id": "wi-founder-demo-2", "seed_marker": "founder-demo-seed-v1"}'::jsonb, NOW() - INTERVAL '110 minutes'),
  ('allura-system', 'workspace-allura', 'blocker_raised', 'brooks', 'completed', '{"fixture": true, "work_item_id": "wi-founder-demo-3", "seed_marker": "founder-demo-seed-v1"}'::jsonb, NOW() - INTERVAL '170 minutes'),
  ('allura-system', 'workspace-allura', 'memory_add', 'scout', 'completed', '{"fixture": true, "seed_marker": "founder-demo-seed-v1"}'::jsonb, NOW() - INTERVAL '4 hours'),
  ('allura-system', 'workspace-allura', 'memory_add', 'scout', 'completed', '{"fixture": true, "seed_marker": "founder-demo-seed-v1"}'::jsonb, NOW() - INTERVAL '6 hours')
) AS seed(group_id, workspace_id, event_type, agent_id, status, metadata, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM events WHERE metadata->>'seed_marker' = 'founder-demo-seed-v1'
);

-- ── Search (allura_memories) ────────────────────────────────────────────────

INSERT INTO allura_memories (session_id, user_id, content, memory_type, group_id, workspace_id, workspace_scope_state)
SELECT * FROM (VALUES
  ('founder-demo-session', 'founder-demo-agent', '[fixture] Founder demo workspace uses disposable seed data only — nothing here is production.', 'episodic', 'allura-system', 'workspace-allura', 'workspace_scoped'),
  ('founder-demo-session', 'founder-demo-agent', '[fixture] Mission Control now surfaces real KPI cards plus an attention list for blocked and in-review work.', 'semantic', 'allura-system', 'workspace-allura', 'workspace_scoped'),
  ('founder-demo-session', 'founder-demo-agent', '[fixture] The mobile navigation menu exposes every dashboard route without horizontal clipping.', 'procedural', 'allura-system', 'workspace-allura', 'workspace_scoped')
) AS seed(session_id, user_id, content, memory_type, group_id, workspace_id, workspace_scope_state)
WHERE NOT EXISTS (SELECT 1 FROM allura_memories WHERE session_id = 'founder-demo-session');

-- ── Graph (graph_memories / graph_supersedes / structural context) ─────────

INSERT INTO graph_memories (id, group_id, workspace_id, workspace_scope_state, content, provenance, version)
VALUES
  ('gm-founder-demo-1', 'allura-system', 'workspace-allura', 'workspace_scoped', '[fixture] Founder demo v1: initial workspace scope note.', 'manual', 1),
  ('gm-founder-demo-2', 'allura-system', 'workspace-allura', 'workspace_scoped', '[fixture] Founder demo v2: supersedes v1 with the corrected workspace scope.', 'manual', 2),
  ('gm-founder-demo-3', 'allura-system', 'workspace-allura', 'workspace_scoped', '[fixture] Founder demo: recent conversation memory for graph review.', 'conversation', 1)
ON CONFLICT (id, group_id) DO NOTHING;

UPDATE graph_memories SET deprecated = true
 WHERE id = 'gm-founder-demo-1' AND group_id = 'allura-system';

INSERT INTO graph_supersedes (newer_id, superseded_id, group_id, workspace_id, workspace_scope_state)
VALUES ('gm-founder-demo-2', 'gm-founder-demo-1', 'allura-system', 'workspace-allura', 'workspace_scoped')
ON CONFLICT (newer_id, superseded_id, group_id) DO NOTHING;

INSERT INTO graph_structural_nodes (node_id, label, group_id, workspace_id, workspace_scope_state, props)
VALUES
  ('agent-founder-demo-woz', 'Agent', 'allura-system', 'workspace-allura', 'workspace_scoped', '{"fixture": true, "name": "woz"}'::jsonb),
  ('project-founder-demo', 'Project', 'allura-system', 'workspace-allura', 'workspace_scoped', '{"fixture": true, "name": "Founder demo workspace"}'::jsonb)
ON CONFLICT (node_id, group_id) DO NOTHING;

INSERT INTO graph_structural_edges (from_id, to_id, rel_type, group_id, workspace_id, workspace_scope_state, props)
VALUES ('agent-founder-demo-woz', 'project-founder-demo', 'CONTRIBUTED', 'allura-system', 'workspace-allura', 'workspace_scoped', '{"fixture": true}'::jsonb)
ON CONFLICT (from_id, to_id, rel_type, group_id) DO NOTHING;

-- ── Overview proposals counter (canonical_proposals) ────────────────────────

INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, tier, status)
VALUES
  ('a0000000-f0fd-0000-0000-0000000000f1', 'allura-system', 'workspace-allura', '[fixture] Founder demo proposal awaiting review.', 0.72, 'adoption', 'pending')
ON CONFLICT (id) DO NOTHING;
