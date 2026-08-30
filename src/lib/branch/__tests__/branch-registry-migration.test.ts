/**
 * Migration 53 shape contract.
 *
 * Text-shape assertions only: this proves the migration file contains the
 * expected DDL for the branch registry and promotion receipts. It cannot
 * prove the tables behave under live RLS — the live-DB lane owns that proof.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("migration 53 branch registry relational contract", () => {
  const sql = readFileSync(
    join(process.cwd(), "docker/postgres-init/53-branch-registry.sql"),
    "utf8",
  )

  it("wraps the migration in a transaction and records schema_versions", () => {
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("INSERT INTO schema_versions (version, applied_at, description)")
    expect(sql).toContain("VALUES (\n  '053',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("creates branch_registry with the full invariant-8 status enum", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS branch_registry")
    expect(sql).toContain("'active', 'degraded', 'expired', 'rejected', 'quarantined', 'rolled_back'")
  })

  it("is tenant-scoped with RLS on app.current_group_id and workspace as a column, not a tenant", () => {
    expect(sql).toContain("group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9]")
    expect(sql).toContain("workspace_id TEXT NOT NULL")
    expect(sql).toContain("ALTER TABLE branch_registry ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE branch_registry FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("current_setting('app.current_group_id', true)")
    // ADR-001: no second RLS axis for workspace — the workspace predicate
    // lives at the CHECK/API layer, never in a policy.
    expect(sql).not.toContain("current_setting('app.current_workspace_id', true)")
  })

  it("requires retention_expires_at for every non-active branch (no unbounded retention)", () => {
    expect(sql).toContain("retention_expires_at TIMESTAMPTZ")
    expect(sql).toContain("CHECK (status = 'active' OR retention_expires_at IS NOT NULL)")
  })

  it("requires a reason and preserved diff snapshot for quarantine/reject/rollback rows", () => {
    expect(sql).toContain("quarantine_reason TEXT")
    expect(sql).toContain("diff_snapshot JSONB")
    expect(sql).toContain("status NOT IN ('quarantined', 'rejected', 'rolled_back')")
    expect(sql).toContain("quarantine_reason IS NOT NULL AND diff_snapshot IS NOT NULL")
  })

  it("creates immutable server-issued promotion_receipts with a deterministic trace id", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS promotion_receipts")
    expect(sql).toContain("trace_id TEXT NOT NULL CHECK (trace_id ~ '^promo-[a-f0-9]{16}$')")
    expect(sql).toContain("diff JSONB NOT NULL")
    expect(sql).toContain("evidence_refs JSONB NOT NULL")
    expect(sql).toContain("app.prevent_promotion_receipt_mutation")
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON promotion_receipts")
    expect(sql).toContain("promotion_receipts_replay_key")
  })

  it("adds the promotion_receipts.proposal_id FK to promotion_proposals(id) (epic-27 retro item)", () => {
    expect(sql).toContain("promotion_receipts_proposal_fkey")
    expect(sql).toContain("FOREIGN KEY (proposal_id) REFERENCES promotion_proposals(id)")
    // Idempotent guard so it applies on fresh and existing DBs
    expect(sql).toContain("IF NOT EXISTS (")
    expect(sql).toContain("conname = 'promotion_receipts_proposal_fkey'")
  })
})
