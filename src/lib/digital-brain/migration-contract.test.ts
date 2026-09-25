import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

import { TENANT_TABLE_INVENTORY } from "@/lib/db/tenant-table-inventory"

const migrationPath = path.resolve(process.cwd(), "docker/postgres-init/71-digital-brain-read-foundation.sql")
const workspaceMigrationPath = path.resolve(process.cwd(), "docker/postgres-init/72-digital-brain-workspace-membership.sql")
const provenanceMigrationPath = path.resolve(process.cwd(), "docker/postgres-init/73-digital-brain-membership-provenance.sql")
const messagingMigrationPath = path.resolve(process.cwd(), "docker/postgres-init/74-digital-brain-restricted-messaging.sql")
const membershipWriterMigrationPath = path.resolve(process.cwd(), "docker/postgres-init/75-digital-brain-membership-governed-writer.sql")
const readReceiptMigrationPath = path.resolve(process.cwd(), "docker/postgres-init/76-digital-brain-production-read-receipts.sql")
const messagingWriterMigrationPath = path.resolve(process.cwd(), "docker/postgres-init/77-digital-brain-governed-messaging-writers.sql")

describe("Epic 30 digital Brain read migration contract", () => {
  it("rejects null and blank department identifiers explicitly", () => {
    const sql = readFileSync(migrationPath, "utf8")
    expect(sql).toContain("visibility = 'department' AND department_id IS NOT NULL AND length(btrim(department_id)) > 0")
  })
  it("forces exact tenant/workspace/owner or department authority under the app role", () => {
    const sql = readFileSync(migrationPath, "utf8")

    expect(sql).toContain("ALTER TABLE brain_documents FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE brain_department_memberships FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("current_setting('app.current_group_id', true)")
    expect(sql).toContain("current_setting('app.current_workspace_id', true)")
    expect(sql).toContain("current_setting('app.current_principal', true)")
    expect(sql).toContain("brain_documents.owner_id = current_setting('app.current_principal', true)")
    expect(sql).not.toMatch(/admin.*private|private.*admin/i)
    expect(sql).toContain("GRANT SELECT ON brain_documents, brain_department_memberships TO allura_app")
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON brain_documents, brain_department_memberships FROM allura_app")
  })

  it("requires active tenant membership in each disclosure policy", () => {
    const sql = readFileSync(migrationPath, "utf8")
    for (const table of ["brain_documents", "brain_department_memberships"]) {
      expect(sql).toContain(`tenant_membership.group_id = ${table}.group_id`)
    }
    expect(sql.match(/tenant_membership.removed_at IS NULL/g)).toHaveLength(2)
    expect(sql.match(/tenant_membership.user_id = current_setting\('app.current_principal', true\)/g)).toHaveLength(2)
  })

  it("classifies every new table in the machine-checked tenant inventory", () => {
    const classified = new Set(TENANT_TABLE_INVENTORY.map(({ table }) => table))

    expect(classified.has("brain_documents")).toBe(true)
    expect(classified.has("brain_department_memberships")).toBe(true)
  })
})

describe("Epic 30 independent workspace membership migration contract", () => {
  it("requires current exact workspace authority for private and department reads", () => {
    const sql = readFileSync(workspaceMigrationPath, "utf8")
    expect(sql).toContain("to_regclass('public.brain_workspace_memberships') IS NOT NULL")
    expect(sql).toContain("CREATE TABLE brain_workspace_memberships")
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS brain_workspace_memberships")
    expect(sql).toContain("PRIMARY KEY (group_id, workspace_id, user_id)")
    expect(sql).toContain("ALTER TABLE brain_workspace_memberships FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("DROP POLICY IF EXISTS brain_document_read_policy ON brain_documents")
    expect(sql).toContain("DROP POLICY IF EXISTS brain_department_membership_read_policy ON brain_department_memberships")
    expect(sql).toContain("workspace_membership.workspace_id = brain_documents.workspace_id")
    expect(sql).toContain("workspace_membership.workspace_id = brain_department_memberships.workspace_id")
    expect(sql).toContain("workspace_membership.revoked_at IS NULL")
    expect(sql).toContain("GRANT SELECT ON brain_workspace_memberships TO allura_app")
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON brain_workspace_memberships FROM allura_app")
    expect(sql).not.toMatch(/INSERT INTO brain_workspace_memberships/i)
    expect(TENANT_TABLE_INVENTORY.some(({ table }) => table === "brain_workspace_memberships")).toBe(true)
  })
})

describe("Epic 30 membership provenance migration contract", () => {
  it("adds exact-scope, RLS-forced, read-only approval and receipt ledgers", () => {
    const sql = readFileSync(provenanceMigrationPath, "utf8")
    for (const table of ["brain_membership_approvals", "brain_membership_receipts"]) {
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
      expect(TENANT_TABLE_INVENTORY.some(({ table: candidate }) => candidate === table)).toBe(true)
    }
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES brain_membership_approvals")
    expect(sql).toContain("approval_id UUID NOT NULL REFERENCES brain_membership_approvals")
    expect(sql).toContain("CREATE POLICY brain_workspace_membership_admin_read_policy")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.brain_has_current_workspace_membership()")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.brain_has_current_workspace_admin()")
    expect(sql).toContain("workspace_membership.approval_id IS NOT NULL")
    expect(sql).toContain("public.brain_has_current_workspace_admin()")
    expect(sql).toContain("rolname='allura_migration' AND rolbypassrls")
    expect(sql).toContain("ALTER FUNCTION public.brain_has_current_workspace_membership() OWNER TO allura_migration")
    expect(sql).toContain("approval_id IS NOT NULL")
    expect(sql).toContain("group_id = current_setting('app.current_group_id', true)")
    expect(sql).toContain("workspace_id = current_setting('app.current_workspace_id', true)")
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON brain_membership_approvals, brain_membership_receipts FROM allura_app")
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE).*TO allura_app/i)
  })
})

describe("Epic 30 restricted messaging migration contract", () => {
  it("keeps durable messaging exact-scope, provenance-bound, and read-only to the app role", () => {
    const sql = readFileSync(messagingMigrationPath, "utf8")
    const tables = ["brain_project_contacts", "brain_messaging_approvals", "brain_channel_invitations", "brain_restricted_messages", "brain_messaging_receipts"]
    for (const table of tables) expect(TENANT_TABLE_INVENTORY.some(({ table: candidate }) => candidate === table)).toBe(true)
    expect(sql).toContain("owner_approval_id UUID NOT NULL REFERENCES brain_messaging_approvals")
    expect(sql).toContain("membership_admin_approval_id UUID NOT NULL REFERENCES brain_messaging_approvals")
    expect(sql).toContain("verification_source TEXT NOT NULL CHECK (verification_source = 'trusted_approval_adapter')")
    expect(sql).toContain("provenance_ref TEXT NOT NULL")
    expect(sql).toContain("invitee_id=current_setting('app.current_principal',true)")
    expect(sql).toContain("sender_id=current_setting('app.current_principal',true)")
    expect(sql).toContain("actor_id=current_setting('app.current_principal',true)")
    expect(sql.match(/public\.brain_has_current_workspace_membership\(\)/g)?.length).toBeGreaterThanOrEqual(5)
    expect(sql.match(/public\.brain_has_current_workspace_admin\(\)/g)?.length).toBeGreaterThanOrEqual(2)
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON brain_project_contacts")
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE).*TO allura_app/i)
  })
})

describe("Epic 30 governed membership writer migration contract", () => {
  it("consumes only receipt-bound verified approvals through a scope-derived transition function", () => {
    const sql = readFileSync(membershipWriterMigrationPath, "utf8")
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.commit_brain_workspace_membership(")
    expect(sql).toContain("LANGUAGE plpgsql SECURITY DEFINER")
    expect(sql).toContain("SET search_path = pg_catalog, pg_temp")
    expect(sql).toContain("current_setting('app.current_group_id', true)")
    expect(sql).toContain("current_setting('app.current_workspace_id', true)")
    expect(sql).toContain("current_setting('app.current_principal', true)")
    expect(sql).toContain("v_approval.consumed_at IS NOT NULL")
    expect(sql).toContain("governed membership receipt refused")
    expect(sql).toContain("SET consumed_at = now()")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.commit_brain_workspace_membership")
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON brain_workspace_memberships FROM allura_app")
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE).*ON brain_workspace_memberships.*TO allura_app/i)
  })
})

describe("Epic 30 governed production read receipt migration contract", () => {
  it("records immutable content-free receipts only through server-scoped authority", () => {
    const sql = readFileSync(readReceiptMigrationPath, "utf8")
    expect(TENANT_TABLE_INVENTORY.some(({ table }) => table === "brain_read_receipts")).toBe(true)
    expect(sql).toContain("ALTER TABLE brain_read_receipts FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("CREATE TRIGGER brain_read_receipts_immutable")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.record_brain_read_receipt(")
    expect(sql).toContain("LANGUAGE plpgsql SECURITY DEFINER")
    expect(sql).toContain("current_setting('app.current_group_id', true)")
    expect(sql).toContain("approval.consumed_at IS NOT NULL")
    expect(sql).toContain("p_session_hash !~ '^[a-f0-9]{64}$'")
    expect(sql).toContain("p_witness_hash !~ '^[a-f0-9]{64}$'")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.record_brain_read_receipt")
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON brain_read_receipts FROM allura_app")
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE).*ON brain_read_receipts.*TO allura_app/i)
  })
})

describe("Epic 30 governed messaging writer migration contract", () => {
  it("uses append-only receipt consumption and scope-derived atomic mutation functions", () => {
    const sql = readFileSync(messagingWriterMigrationPath, "utf8")
    expect(TENANT_TABLE_INVENTORY.some(({ table }) => table === "brain_messaging_receipt_consumptions")).toBe(true)
    expect(sql).toContain("CREATE TABLE brain_messaging_receipt_consumptions")
    expect(sql).toContain("ALTER TABLE brain_messaging_receipt_consumptions FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("CREATE TRIGGER brain_messaging_receipts_immutable")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.record_brain_messaging_receipt(")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.commit_brain_channel_invitation(")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.commit_brain_restricted_message(")
    expect(sql).toContain("brain_messaging_receipt_consumptions AS consumption")
    expect(sql).toContain("membership_approval.consumed_at IS NOT NULL")
    expect(sql).toContain("verification_source = 'trusted_approval_adapter'")
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON brain_messaging_approvals, brain_messaging_receipts, brain_messaging_receipt_consumptions")
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE).*TO allura_app/i)
  })
})
