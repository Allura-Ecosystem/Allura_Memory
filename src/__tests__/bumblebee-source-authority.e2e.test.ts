import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Pool, type PoolClient } from "pg"

const GROUP_ID = "allura-bmb-source-e2e"
const WORKSPACE_ID = "ws-bmb-source-e2e"
const CATALOG_DIGEST = "b".repeat(64)

function pool(user: string, password: string): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "memory",
    user,
    password,
    max: 2,
  })
}

async function withScope<T>(client: PoolClient, work: () => Promise<T>): Promise<T> {
  await client.query("BEGIN")
  try {
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [GROUP_ID])
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [WORKSPACE_ID])
    const result = await work()
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD
  ? describe
  : describe.skip

describeLive("Story 26.7 Bumblebee source authority under allura_app", () => {
  const owner = pool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = pool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "")

  beforeAll(async () => {
    await owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1, $2, 'Bumblebee source e2e') ON CONFLICT (workspace_id) DO NOTHING`,
      [WORKSPACE_ID, GROUP_ID],
    )
    const client = await app.connect()
    try {
      await withScope(client, async () => {
        await client.query(
          `INSERT INTO bumblebee_runner_credentials
             (credential_id, group_id, workspace_id, token_prefix, token_hash, created_by)
           VALUES ('runner-1', $1, $2, 'bmb_runner_12345678', $3, 'e2e')`,
          [GROUP_ID, WORKSPACE_ID, "a".repeat(64)],
        )
        await client.query(
          `INSERT INTO bumblebee_catalog_revisions
             (group_id, workspace_id, catalog_revision_id, catalog_digest, canonical_catalog,
              provenance, catalog_schema_version, reviewed_by, approval_receipt_id,
              classification, redaction_policy)
           VALUES ($1, $2, 'catalog-1', $3, '{}'::jsonb, '{}'::jsonb,
                   '1', 'reviewer', 'approval-1', 'internal', 'redaction-v1')`,
          [GROUP_ID, WORKSPACE_ID, CATALOG_DIGEST],
        )
        await client.query(
          `INSERT INTO bumblebee_sources
             (group_id, workspace_id, source_id, source_revision_id, revision_digest,
              endpoint_device_id, runner_credential_id, scanner_tag, scanner_commit, scanner_tree,
              scanner_artifact_sha256, record_schema_version, profile, mode, findings_enabled,
              root_config_digest, ecosystems, all_users, freshness_ttl_seconds, retention_days,
              classification, redaction_policy, catalog_revision_id, catalog_digest)
           VALUES ($1, $2, 'source-1', 'revision-1', $3, 'device-1', 'runner-1',
                   'v0.1.2', 'cc57710eeaf685e7b89924a36c8583cad0a378fe',
                   '985f57cf1749c15561c886c4476f10950ffa9cae', $4, '0.1.0', 'baseline',
                   'inventory', true, $5, ARRAY['npm'], false, 3600, 30, 'internal',
                   'redaction-v1', 'catalog-1', $6)`,
          [GROUP_ID, WORKSPACE_ID, "d".repeat(64), "e".repeat(64), "f".repeat(64), CATALOG_DIGEST],
        )
      })
    } finally {
      client.release()
    }
  })

  afterAll(async () => {
    await Promise.all([app.end(), owner.end()])
  })

  it("rejects blank credential and catalog revision identities under the app role", async () => {
    const client = await app.connect()
    try {
      await expect(withScope(client, () => client.query(
        `INSERT INTO bumblebee_runner_credentials
           (credential_id, group_id, workspace_id, token_prefix, token_hash, created_by)
         VALUES ('', $1, $2, 'bmb_runner_87654321', $3, 'e2e')`,
        [GROUP_ID, WORKSPACE_ID, "9".repeat(64)],
      ))).rejects.toMatchObject({ code: "23514" })
      await expect(withScope(client, () => client.query(
        `INSERT INTO bumblebee_catalog_revisions
           (group_id, workspace_id, catalog_revision_id, catalog_digest, canonical_catalog,
            provenance, catalog_schema_version, reviewed_by, approval_receipt_id,
            classification, redaction_policy)
         VALUES ($1, $2, '', $3, '{}'::jsonb, '{}'::jsonb,
                 '1', 'reviewer', 'approval-blank', 'internal', 'redaction-v1')`,
        [GROUP_ID, WORKSPACE_ID, "8".repeat(64)],
      ))).rejects.toMatchObject({ code: "23514" })
    } finally {
      client.release()
    }
  })

  it("rejects a blank catalog entry identity under the app role", async () => {
    const client = await app.connect()
    try {
      await expect(withScope(client, () => client.query(
        `INSERT INTO bumblebee_catalog_entries
           (group_id, workspace_id, catalog_revision_id, catalog_entry_id, normalized_entry, entry_digest)
         VALUES ($1, $2, 'catalog-1', '', '{}'::jsonb, $3)`,
        [GROUP_ID, WORKSPACE_ID, "7".repeat(64)],
      ))).rejects.toMatchObject({ code: "23514" })
    } finally {
      client.release()
    }
  })

  it.each([
    ["source_id", "", "revision-blank-source", "device-blank-source", "runner-1", "catalog-1", "1".repeat(64)],
    ["source_revision_id", "source-blank-revision", "", "device-blank-revision", "runner-1", "catalog-1", "2".repeat(64)],
    ["endpoint_device_id", "source-blank-device", "revision-blank-device", "", "runner-1", "catalog-1", "3".repeat(64)],
    ["runner_credential_id", "source-blank-runner", "revision-blank-runner", "device-blank-runner", "", "catalog-1", "4".repeat(64)],
    ["non-null catalog_revision_id", "source-blank-catalog", "revision-blank-catalog", "device-blank-catalog", "runner-1", "", "5".repeat(64)],
  ])("rejects a blank %s under the app role", async (
    _identity,
    sourceId,
    sourceRevisionId,
    endpointDeviceId,
    runnerCredentialId,
    catalogRevisionId,
    revisionDigest,
  ) => {
    const client = await app.connect()
    try {
      await expect(withScope(client, () => client.query(
        `INSERT INTO bumblebee_sources
           (group_id, workspace_id, source_id, source_revision_id, revision_digest,
            endpoint_device_id, runner_credential_id, scanner_tag, scanner_commit, scanner_tree,
            scanner_artifact_sha256, record_schema_version, profile, mode, findings_enabled,
            root_config_digest, ecosystems, all_users, freshness_ttl_seconds, retention_days,
            classification, redaction_policy, catalog_revision_id, catalog_digest)
         SELECT $1, $2, $3, $4, $5, $6, $7, scanner_tag, scanner_commit, scanner_tree,
                scanner_artifact_sha256, record_schema_version, profile, mode, findings_enabled,
                root_config_digest, ecosystems, all_users, freshness_ttl_seconds, retention_days,
                classification, redaction_policy, $8, catalog_digest
         FROM bumblebee_sources WHERE source_id='source-1'`,
        [
          GROUP_ID,
          WORKSPACE_ID,
          sourceId,
          sourceRevisionId,
          revisionDigest,
          endpointDeviceId,
          runnerCredentialId,
          catalogRevisionId,
        ],
      ))).rejects.toMatchObject({ code: "23514" })
    } finally {
      client.release()
    }
  })

  it("binds a findings source to the exact approved catalog digest", async () => {
    const client = await app.connect()
    try {
      await expect(withScope(client, () => client.query(
        `INSERT INTO bumblebee_sources
           (group_id, workspace_id, source_id, source_revision_id, revision_digest,
            endpoint_device_id, runner_credential_id, scanner_tag, scanner_commit, scanner_tree,
            scanner_artifact_sha256, record_schema_version, profile, mode, findings_enabled,
            root_config_digest, ecosystems, all_users, freshness_ttl_seconds, retention_days,
            classification, redaction_policy, catalog_revision_id, catalog_digest)
         SELECT $1, $2, 'source-bad', 'revision-bad', $3, endpoint_device_id,
                runner_credential_id, scanner_tag, scanner_commit, scanner_tree,
                scanner_artifact_sha256, record_schema_version, profile, mode, findings_enabled,
                root_config_digest, ecosystems, all_users, freshness_ttl_seconds, retention_days,
                classification, redaction_policy, catalog_revision_id, $4
         FROM bumblebee_sources WHERE source_id='source-1'`,
        [GROUP_ID, WORKSPACE_ID, "6".repeat(64), "2".repeat(64)],
      ))).rejects.toMatchObject({ code: "23503" })
    } finally {
      client.release()
    }
  })

  it("makes runner revocation one-way", async () => {
    const client = await app.connect()
    try {
      await withScope(client, () => client.query(
        "UPDATE bumblebee_runner_credentials SET revoked_at=NOW() WHERE credential_id='runner-1'",
      ))
      await expect(withScope(client, () => client.query(
        "UPDATE bumblebee_runner_credentials SET revoked_at=NULL WHERE credential_id='runner-1'",
      ))).rejects.toThrow(/revocation is immutable once set/)
    } finally {
      client.release()
    }
  })

  it("denies cross-scope visibility and exposes no delete privilege", async () => {
    const client = await app.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT set_config('app.current_group_id', 'allura-other', true)")
      await client.query("SELECT set_config('app.current_workspace_id', 'ws-other', true)")
      const visible = await client.query("SELECT count(*)::int AS count FROM bumblebee_sources")
      const privileges = await client.query(
        "SELECT has_table_privilege(current_user, 'bumblebee_sources', 'DELETE') AS can_delete",
      )
      await client.query("ROLLBACK")
      expect(visible.rows[0].count).toBe(0)
      expect(privileges.rows[0].can_delete).toBe(false)
    } finally {
      client.release()
    }
  })
})
