-- Seed governed proposals for the curator review queue.
--
-- Column notes (schema-verified):
--   id          uuid    — generated, never text
--   trace_ref   bigint  — FOREIGN KEY into events(id): every proposal must
--                         trace back to a real recorded event (provenance)
--   workspace_id text   — the dashboard scopes the queue by workspace, so a
--                         proposal without it never appears in the review queue
INSERT INTO canonical_proposals
  (id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref, created_at)
VALUES
  (
    gen_random_uuid(),
    'allura-system',
    'workspace-allura',
    'Retrieval latency regression detected in the hybrid search path: p95 rose from 180ms to 410ms after the 4096-dimension embedding migration. Recommend re-tuning the HNSW ef_search parameter before the next release.',
    0.910,
    'High-confidence: reproduced across three consecutive benchmark runs with consistent effect size, and isolated to the embedding-dimension change.',
    'mainstream',
    'pending',
    (SELECT id FROM events WHERE group_id = 'allura-system' ORDER BY id OFFSET 0 LIMIT 1),
    NOW() - INTERVAL '2 hours'
  ),
  (
    gen_random_uuid(),
    'allura-system',
    'workspace-allura',
    'Cross-tenant isolation must be enforced at the database layer, not only in the application. Row-Level Security policies exist on three audit tables but are inert because the application connects as the table owner without FORCE ROW LEVEL SECURITY.',
    0.870,
    'Verified against the migration set and the live connection role. Material control gap for regulated deployments.',
    'adoption',
    'pending',
    (SELECT id FROM events WHERE group_id = 'allura-system' ORDER BY id OFFSET 1 LIMIT 1),
    NOW() - INTERVAL '45 minutes'
  ),
  (
    gen_random_uuid(),
    'allura-system',
    'workspace-allura',
    'Agent tool-calling contracts should reject unknown fields rather than ignoring them, so that a caller cannot smuggle authority-bearing arguments past the validation boundary.',
    0.640,
    'Emerging pattern observed across two integrations; worth review but not yet supported by regression evidence.',
    'emerging',
    'pending',
    (SELECT id FROM events WHERE group_id = 'allura-system' ORDER BY id OFFSET 2 LIMIT 1),
    NOW() - INTERVAL '10 minutes'
  );
