-- Migration 50: Bumblebee current-state views (contract item 10).
--
-- Story 26.7 AC-11 (snapshot truth) and the retrieval half of AC-18 need to
-- answer "what does the caller see right now" without re-deriving generation
-- and promotion logic in every consumer.
--
-- SECURITY (post-review correction): a plain PostgreSQL view defaults to
-- security_invoker = false, which means the view body runs with the OWNER's
-- privileges and RLS context, NOT the querying role's. These views are
-- created by the migration-applying role (allura / allura_migration), which
-- carries BYPASSRLS -- so without an explicit override, FORCE ROW LEVEL
-- SECURITY on bumblebee_scan_leases, bumblebee_batch_receipts, bumblebee_records,
-- bumblebee_run_decisions, and bumblebee_sources is silently bypassed the
-- moment access goes through one of these views, even for a low-privilege
-- caller like allura_app. Each CREATE VIEW below is therefore declared
-- WITH (security_invoker = true) (PostgreSQL 15+; this cluster is PG16), which
-- forces the view to evaluate with the QUERYING role's own privileges and RLS
-- context -- the property the original comment incorrectly assumed was the
-- default. This is preferred over re-owning the views to a non-BYPASSRLS role
-- because it holds regardless of which role happens to apply migrations in a
-- given deployment. A view is a SEPARATE ACL object from its base tables, so
-- each one gets its own explicit GRANT below -- a GRANT on the underlying
-- tables does NOT extend to a view over them.
BEGIN;

-- ── Supporting indexes ───────────────────────────────────────────────────
-- None of these lookups (decision by partition+decision, lease by
-- partition+profile+generation, record by lease+type) had a supporting index
-- before this migration; bumblebee_records' PK is
-- (group_id, workspace_id, source_id, run_id, record_id), so a lease_id +
-- record_type predicate has no index at all today.
CREATE INDEX IF NOT EXISTS bumblebee_run_decisions_partition_decision_idx
  ON bumblebee_run_decisions (group_id, workspace_id, source_id, source_revision_id, decision, lease_id, batch_id);

CREATE INDEX IF NOT EXISTS bumblebee_scan_leases_partition_generation_idx
  ON bumblebee_scan_leases (group_id, workspace_id, source_id, source_revision_id, profile, generation DESC);

CREATE INDEX IF NOT EXISTS bumblebee_records_lease_type_idx
  ON bumblebee_records (group_id, workspace_id, source_id, lease_id, record_type);

-- ── bumblebee_current_routine_runs ───────────────────────────────────────
-- One row per (group_id, workspace_id, source_id, source_revision_id, profile)
-- partition, restricted to routine profiles (baseline, project) -- 'deep' is
-- excluded entirely, never unioned in, per the campaign-vs-routine split.
-- The row exists the moment a lease has ever been issued for that partition
-- (a real row, regardless of whether any batch has landed yet), and rolls up
-- decision counts across every batch under the CURRENT (highest-generation)
-- lease so a caller can tell "current run is fully promoted" from
-- "current run has held batches outstanding" without a second query.
CREATE OR REPLACE VIEW bumblebee_current_routine_runs WITH (security_invoker = true) AS
WITH ranked_leases AS (
  SELECT
    l.group_id, l.workspace_id, l.source_id, l.source_revision_id, l.profile,
    l.lease_id, l.generation, l.mode, l.expires_at, l.revoked_at,
    ROW_NUMBER() OVER (
      PARTITION BY l.group_id, l.workspace_id, l.source_id, l.source_revision_id, l.profile
      ORDER BY l.generation DESC
    ) AS rn
  FROM bumblebee_scan_leases l
  WHERE l.profile IN ('baseline', 'project')
),
current_lease AS (
  SELECT group_id, workspace_id, source_id, source_revision_id, profile,
    lease_id, generation, mode, expires_at, revoked_at
  FROM ranked_leases
  WHERE rn = 1
)
SELECT
  cl.group_id, cl.workspace_id, cl.source_id, cl.source_revision_id, cl.profile,
  cl.lease_id, cl.generation, cl.mode, cl.expires_at, cl.revoked_at,
  s.freshness_ttl_seconds,
  COUNT(DISTINCT br.batch_id) AS batch_count,
  COUNT(DISTINCT rd.decision_id) FILTER (WHERE rd.decision = 'promoted') AS promoted_decision_count,
  COUNT(DISTINCT rd.decision_id) FILTER (WHERE rd.decision = 'held') AS held_decision_count,
  MAX(rd.decided_at) AS decided_at
FROM current_lease cl
JOIN bumblebee_sources s
  ON s.group_id = cl.group_id AND s.workspace_id = cl.workspace_id
 AND s.source_id = cl.source_id AND s.source_revision_id = cl.source_revision_id
LEFT JOIN bumblebee_batch_receipts br
  ON br.group_id = cl.group_id AND br.workspace_id = cl.workspace_id
 AND br.source_id = cl.source_id AND br.source_revision_id = cl.source_revision_id
 AND br.lease_id = cl.lease_id
LEFT JOIN bumblebee_run_decisions rd
  ON rd.group_id = br.group_id AND rd.workspace_id = br.workspace_id
 AND rd.source_id = br.source_id AND rd.source_revision_id = br.source_revision_id
 AND rd.lease_id = br.lease_id AND rd.batch_id = br.batch_id
GROUP BY cl.group_id, cl.workspace_id, cl.source_id, cl.source_revision_id, cl.profile,
  cl.lease_id, cl.generation, cl.mode, cl.expires_at, cl.revoked_at, s.freshness_ttl_seconds;

-- ── bumblebee_current_inventory ──────────────────────────────────────────
-- AC-11 snapshot truth. `profile` is a partition key, not a post-aggregation
-- filter -- routine (baseline, project) partitions are never unioned with
-- each other or with deep. The current generation for a partition is the
-- MAX(generation) among leases that reached a PROMOTED decision (computed in
-- current_generation below, not MAX(generation) over every lease -- a later
-- generation that is still held or never scanned does not displace the last
-- promoted one). Package records are joined for that exact (lease_id,
-- batch_id) pair only, so a batch from a different generation under the same
-- lease chain can never leak into the wrong snapshot. A partition with a
-- promoted generation but zero package rows is a real row (package_count=0);
-- a partition that was never promoted produces NO row at all -- the two
-- states are never coalesced.
CREATE OR REPLACE VIEW bumblebee_current_inventory WITH (security_invoker = true) AS
WITH promoted_batches AS (
  SELECT
    l.group_id, l.workspace_id, l.source_id, l.source_revision_id, l.profile,
    l.lease_id, l.generation, rd.batch_id, rd.decided_at
  FROM bumblebee_scan_leases l
  JOIN bumblebee_batch_receipts br
    ON br.group_id = l.group_id AND br.workspace_id = l.workspace_id
   AND br.source_id = l.source_id AND br.source_revision_id = l.source_revision_id
   AND br.lease_id = l.lease_id
  JOIN bumblebee_run_decisions rd
    ON rd.group_id = br.group_id AND rd.workspace_id = br.workspace_id
   AND rd.source_id = br.source_id AND rd.source_revision_id = br.source_revision_id
   AND rd.lease_id = br.lease_id AND rd.batch_id = br.batch_id
  WHERE rd.decision = 'promoted' AND l.profile <> 'deep'
),
current_generation AS (
  SELECT group_id, workspace_id, source_id, source_revision_id, profile,
    MAX(generation) AS generation
  FROM promoted_batches
  GROUP BY group_id, workspace_id, source_id, source_revision_id, profile
),
current_promoted_batches AS (
  SELECT pb.group_id, pb.workspace_id, pb.source_id, pb.source_revision_id, pb.profile,
    pb.lease_id, pb.generation, pb.batch_id, pb.decided_at
  FROM promoted_batches pb
  JOIN current_generation cg
    ON cg.group_id = pb.group_id AND cg.workspace_id = pb.workspace_id
   AND cg.source_id = pb.source_id AND cg.source_revision_id = pb.source_revision_id
   AND cg.profile = pb.profile AND cg.generation = pb.generation
)
SELECT
  cpb.group_id, cpb.workspace_id, cpb.source_id, cpb.source_revision_id, cpb.profile,
  cpb.lease_id, cpb.generation,
  MAX(cpb.decided_at) AS decided_at,
  s.freshness_ttl_seconds,
  COUNT(r.record_id) AS package_count,
  COALESCE(
    jsonb_agg(r.sanitized_payload ORDER BY r.record_id) FILTER (WHERE r.record_id IS NOT NULL),
    '[]'::jsonb
  ) AS packages
FROM current_promoted_batches cpb
JOIN bumblebee_sources s
  ON s.group_id = cpb.group_id AND s.workspace_id = cpb.workspace_id
 AND s.source_id = cpb.source_id AND s.source_revision_id = cpb.source_revision_id
LEFT JOIN bumblebee_records r
  ON r.group_id = cpb.group_id AND r.workspace_id = cpb.workspace_id
 AND r.source_id = cpb.source_id AND r.source_revision_id = cpb.source_revision_id
 AND r.lease_id = cpb.lease_id AND r.batch_id = cpb.batch_id AND r.record_type = 'package'
GROUP BY cpb.group_id, cpb.workspace_id, cpb.source_id, cpb.source_revision_id, cpb.profile,
  cpb.lease_id, cpb.generation, s.freshness_ttl_seconds;

-- ── bumblebee_incomplete_runs ─────────────────────────────────────────────
-- The retrieval half of AC-18: which partitions' CURRENT (highest-generation)
-- lease has not reached a promoted state. Unlike the two views above, this one
-- is NOT restricted to routine profiles -- an operator needs to see a stuck
-- deep campaign exactly as much as a stuck routine scan, so all three
-- profiles are covered. A row appears when the latest decision recorded
-- against the current lease is 'held', or when no decision has been recorded
-- at all yet (batch still in flight / lease issued but nothing ingested);
-- rows whose latest decision is 'promoted' are excluded -- that state is
-- "complete" and belongs to bumblebee_current_inventory /
-- bumblebee_current_routine_runs instead.
CREATE OR REPLACE VIEW bumblebee_incomplete_runs WITH (security_invoker = true) AS
WITH ranked_leases AS (
  SELECT
    l.group_id, l.workspace_id, l.source_id, l.source_revision_id, l.profile,
    l.lease_id, l.generation, l.expires_at, l.revoked_at,
    ROW_NUMBER() OVER (
      PARTITION BY l.group_id, l.workspace_id, l.source_id, l.source_revision_id, l.profile
      ORDER BY l.generation DESC
    ) AS rn
  FROM bumblebee_scan_leases l
),
current_lease AS (
  SELECT group_id, workspace_id, source_id, source_revision_id, profile,
    lease_id, generation, expires_at, revoked_at
  FROM ranked_leases
  WHERE rn = 1
),
latest_decision AS (
  SELECT DISTINCT ON (rd.group_id, rd.workspace_id, rd.source_id, rd.source_revision_id, rd.lease_id)
    rd.group_id, rd.workspace_id, rd.source_id, rd.source_revision_id, rd.lease_id,
    rd.batch_id, rd.decision, rd.reason_code, rd.summary_record_id, rd.decided_at
  FROM bumblebee_run_decisions rd
  ORDER BY rd.group_id, rd.workspace_id, rd.source_id, rd.source_revision_id, rd.lease_id, rd.decided_at DESC
)
SELECT
  cl.group_id, cl.workspace_id, cl.source_id, cl.source_revision_id, cl.profile,
  cl.lease_id, cl.generation, cl.expires_at, cl.revoked_at,
  s.freshness_ttl_seconds,
  ld.batch_id, ld.decision, ld.reason_code, ld.summary_record_id, ld.decided_at
FROM current_lease cl
JOIN bumblebee_sources s
  ON s.group_id = cl.group_id AND s.workspace_id = cl.workspace_id
 AND s.source_id = cl.source_id AND s.source_revision_id = cl.source_revision_id
LEFT JOIN latest_decision ld
  ON ld.group_id = cl.group_id AND ld.workspace_id = cl.workspace_id
 AND ld.source_id = cl.source_id AND ld.source_revision_id = cl.source_revision_id
 AND ld.lease_id = cl.lease_id
WHERE ld.decision IS DISTINCT FROM 'promoted';

-- ── Grants ────────────────────────────────────────────────────────────────
-- Views are separate ACL objects from their base tables -- a GRANT on
-- bumblebee_scan_leases etc. does not extend to a view built over them.
-- Without these, allura_app can read every underlying table directly yet get
-- "permission denied for view" the moment it queries the view instead.
GRANT SELECT ON bumblebee_current_routine_runs TO allura_app;
GRANT SELECT ON bumblebee_current_inventory TO allura_app;
GRANT SELECT ON bumblebee_incomplete_runs TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('050', NOW(), 'Story 26.7 Bumblebee current-state views: routine runs, current inventory, incomplete runs')
ON CONFLICT (version) DO NOTHING;

COMMIT;
