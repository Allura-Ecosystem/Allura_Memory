\set ON_ERROR_STOP on

BEGIN;

INSERT INTO workspaces (workspace_id, group_id, name)
VALUES ('epic31-browser-workspace', 'allura-epic31-browser', 'Epic 31 browser evidence');

INSERT INTO memberships (id, group_id, user_id, email, role)
VALUES (
  '31000000-0000-4000-8000-000000000001',
  'allura-epic31-browser',
  'epic31-browser-evidence',
  'epic31-browser-evidence@allura.local',
  'viewer'
);

INSERT INTO brain_membership_approvals (
  approval_id, group_id, workspace_id, subject_user_id, approver_id,
  approver_role, action, provenance_ref, policy_epoch, verified_at, consumed_at
)
VALUES (
  '31000000-0000-4000-8000-000000000002',
  'allura-epic31-browser',
  'epic31-browser-workspace',
  'epic31-browser-evidence',
  'epic31-browser-admin',
  'workspace_membership_admin',
  'grant',
  'test:epic31-browser-evidence',
  1,
  now(),
  now()
);

INSERT INTO brain_workspace_memberships (
  group_id, workspace_id, user_id, approved_by, policy_epoch, approval_id
)
VALUES (
  'allura-epic31-browser',
  'epic31-browser-workspace',
  'epic31-browser-evidence',
  'epic31-browser-admin',
  1,
  '31000000-0000-4000-8000-000000000002'
);

INSERT INTO graph_memories (
  id, group_id, workspace_id, workspace_scope_state, user_id, content,
  score, provenance, version, deprecated, created_at
)
VALUES
  (
    'epic31-memory-current', 'allura-epic31-browser', 'epic31-browser-workspace',
    'workspace_scoped', 'epic31-browser-evidence',
    'Current governed operating decision', 0.95, 'manual', 2, false,
    '2026-10-12T10:00:00Z'
  ),
  (
    'epic31-memory-previous', 'allura-epic31-browser', 'epic31-browser-workspace',
    'workspace_scoped', 'epic31-browser-evidence',
    'Previous governed operating decision', 0.82, 'manual', 1, true,
    '2026-10-11T10:00:00Z'
  ),
  (
    'epic31-memory-related', 'allura-epic31-browser', 'epic31-browser-workspace',
    'workspace_scoped', 'epic31-browser-evidence',
    'Related governed operating context', 0.88, 'manual', 1, false,
    '2026-10-12T09:30:00Z'
  );

INSERT INTO graph_structural_nodes (
  node_id, label, group_id, workspace_id, workspace_scope_state, props, created_at
)
VALUES (
  'epic31-agent-woz', 'Agent', 'allura-epic31-browser',
  'epic31-browser-workspace', 'workspace_scoped',
  '{"name":"Woz implementation agent"}'::jsonb,
  '2026-10-12T09:00:00Z'
);

INSERT INTO graph_structural_edges (
  from_id, to_id, rel_type, group_id, workspace_id, workspace_scope_state,
  from_kind, to_kind, endpoint_state, created_at
)
VALUES
  (
    'epic31-memory-current', 'epic31-agent-woz', 'AUTHORED_BY',
    'allura-epic31-browser', 'epic31-browser-workspace', 'workspace_scoped',
    'memory', 'structural', 'resolved', '2026-10-12T10:01:00Z'
  ),
  (
    'epic31-memory-related', 'epic31-memory-current', 'RELATES_TO',
    'allura-epic31-browser', 'epic31-browser-workspace', 'workspace_scoped',
    'memory', 'memory', 'resolved', '2026-10-12T10:01:30Z'
  );

INSERT INTO graph_supersedes (
  newer_id, superseded_id, group_id, workspace_id, workspace_scope_state, created_at
)
VALUES (
  'epic31-memory-current', 'epic31-memory-previous',
  'allura-epic31-browser', 'epic31-browser-workspace',
  'workspace_scoped', '2026-10-12T10:02:00Z'
);

INSERT INTO events (
  id, group_id, workspace_id, event_type, agent_id, status, metadata
)
VALUES (
  310000000000000003,
  'allura-epic31-browser', 'epic31-browser-workspace',
  'focused_subgraph_evidence', 'epic31-browser-evidence', 'completed', '{}'::jsonb
);

INSERT INTO canonical_proposals (
  id, group_id, workspace_id, content, score, tier, status, trace_ref,
  approved_memory_id, decided_at, decided_by, rationale
)
VALUES (
  '31000000-0000-4000-8000-000000000004',
  'allura-epic31-browser', 'epic31-browser-workspace',
  'Current governed operating decision', 0.95, 'mainstream', 'approved',
  '310000000000000003', 'epic31-memory-current',
  now(), 'epic31-browser-admin', 'Browser evidence fixture approval'
);

INSERT INTO governance_receipts (
  group_id, workspace_id, proposal_id, proposal_version, evidence_identity_hash,
  action, actor_id, actor_role, rationale, policy_reference, policy_version,
  memory_id, outbox_state, source_event_id, witness_hash, evidence_references
)
VALUES (
  'allura-epic31-browser', 'epic31-browser-workspace',
  '31000000-0000-4000-8000-000000000004', '1',
  encode(digest('["event:epic31-browser-evidence"]', 'sha256'), 'hex'),
  'approve', 'epic31-browser-admin', 'curator',
  'Approved with evidence', 'policy://allura/focused-subgraph', '1',
  'epic31-memory-current', 'synced',
  310000000000000003, 'epic31-browser-witness',
  '["event:epic31-browser-evidence"]'::jsonb
);

COMMIT;
