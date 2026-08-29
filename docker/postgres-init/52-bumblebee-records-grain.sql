-- Migration 52: correct the bumblebee evidence grain (fail-closed source binding).
--
-- The bumblebee_records primary key declared by migration 48 was
-- (group_id, workspace_id, source_id, run_id, record_id). run_id is
-- scanner-supplied, and the pinned scanner can reuse it across leases and
-- generations of the same source, so that key did not uniquely identify a
-- stored record. The consequences were two-fold:
--
--   1. bumblebee_records itself could not hold two records that shared a
--      run_id under the same source (a real re-scanned generation), and
--
--   2. bumblebee_run_decisions' summary reference
--      (group_id, workspace_id, source_id, run_id, summary_record_id)
--      pointed at the same ambiguous grain, so a summary record persisted
--      under one lease/generation could satisfy a decision row written under
--      a different one — a cross-lease citation that the current-state views
--      and the promotion audit would trust.
--
-- The receipts table already binds every batch to exactly one
-- (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id),
-- so this migration moves bumblebee_records onto that same lease-bound grain
-- and re-points the run_decisions summary reference at it. A decision row
-- carries all seven grain columns itself, so the reference is now
-- same-grain: a cited summary can only ever be the one persisted in this
-- exact lease and batch — never a lookalike from another run.
--
-- Migration 48 is already applied in every deployed database, so it is not
-- edited; the forward-only ALTERs below are the complete fix.
BEGIN;

-- 1) Drop the run_decisions summary FK before its referenced PK can change.
--    Migration 48 declared the FK inline, so PostgreSQL auto-named it from
--    the referencing columns and truncated the result to 63 characters:
--    bumblebee_run_decisions_group_id_workspace_id_source_id_ru_fkey
--    (verified live against a fresh PG16 apply of migration 48).
ALTER TABLE bumblebee_run_decisions DROP CONSTRAINT IF EXISTS bumblebee_run_decisions_group_id_workspace_id_source_id_ru_fkey;

-- 2) Replace the ambiguous records PK with the full lease-bound grain.
ALTER TABLE bumblebee_records DROP CONSTRAINT bumblebee_records_pkey;
ALTER TABLE bumblebee_records ADD CONSTRAINT bumblebee_records_pkey PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id);

-- 3) Re-bind the summary reference on that same grain. Every referenced
--    column exists on the run_decisions row itself, so an insert can only
--    cite the summary that was persisted with this exact batch.
ALTER TABLE bumblebee_run_decisions ADD CONSTRAINT bumblebee_run_decisions_summary_record_id_fkey FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, summary_record_id)
  REFERENCES bumblebee_records(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id);

-- 4) The PK no longer leads with run_id, so lookups by scanner run keep a
--    supporting index (the run_id in a batch is constant per lease).
CREATE INDEX IF NOT EXISTS bumblebee_records_run_id_idx
  ON bumblebee_records (group_id, workspace_id, source_id, run_id);

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('052', NOW(), 'Correct bumblebee evidence grain: lease-bound records PK and same-grain run_decisions summary reference')
ON CONFLICT (version) DO NOTHING;

COMMIT;
