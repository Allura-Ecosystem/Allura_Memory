import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  authorizeBumblebeeRoute,
  BUMBLEBEE_AUTH_ERROR,
  BUMBLEBEE_SOURCE_ERROR,
  createSourceRevision,
} from "../source-authority"

const SHA_A = "a".repeat(64)
const SHA_B = "b".repeat(64)

function sourceInput() {
  return {
    groupId: "allura-system",
    workspaceId: "ws-system",
    sourceId: "src-endpoint-1",
    endpointDeviceId: "device-1",
    runnerCredentialId: "runner-credential-1",
    runnerAudience: "bumblebee_runner" as const,
    scanner: {
      tag: "v0.1.2",
      commit: "cc57710eeaf685e7b89924a36c8583cad0a378fe",
      tree: "985f57cf1749c15561c886c4476f10950ffa9cae",
      artifactSha256: SHA_A,
      schemaVersion: "0.1.0",
    },
    profile: "baseline" as const,
    mode: "inventory" as const,
    findingsEnabled: false,
    rootConfigDigest: SHA_B,
    ecosystems: ["npm"] as const,
    allUsers: false,
    freshnessTtlSeconds: 3600,
    retentionDays: 30,
    classification: "internal" as const,
    redactionPolicy: "bumblebee-redaction-v1",
    catalogRevisionId: null,
    catalogDigest: null,
  }
}

describe("Story 26.7 source authority", () => {
  it("creates a deeply immutable, scope-bound source population revision", () => {
    const revision = createSourceRevision(sourceInput())

    expect(revision.groupId).toBe("allura-system")
    expect(revision.runnerAudience).toBe("bumblebee_runner")
    expect(revision.revisionDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(revision)).toBe(true)
    expect(Object.isFrozen(revision.scanner)).toBe(true)
    expect(Object.isFrozen(revision.ecosystems)).toBe(true)
  })

  it("changes revision identity when a population field changes", () => {
    const first = createSourceRevision(sourceInput())
    const second = createSourceRevision({ ...sourceInput(), allUsers: true })

    expect(second.revisionDigest).not.toBe(first.revisionDigest)
  })

  it("requires a scope-qualified immutable catalog revision for findings-enabled sources", () => {
    expect(() =>
      createSourceRevision({ ...sourceInput(), findingsEnabled: true }),
    ).toThrowError("BUMBLEBEE_SOURCE_CATALOG_REQUIRED")

    const revision = createSourceRevision({
      ...sourceInput(),
      mode: "findings-only",
      findingsEnabled: true,
      catalogRevisionId: "catalog-revision-1",
      catalogDigest: SHA_A,
    })
    expect(revision.catalogRevisionId).toBe("catalog-revision-1")
  })

  it("exports stable reason codes for pin and retention refusals", () => {
    expect(() => createSourceRevision({
      ...sourceInput(),
      scanner: { ...sourceInput().scanner, tag: "v0.1.3" },
    })).toThrowError(BUMBLEBEE_SOURCE_ERROR.scannerPin)
    expect(() => createSourceRevision({
      ...sourceInput(),
      retentionDays: 0,
    })).toThrowError(BUMBLEBEE_SOURCE_ERROR.invalidRetention)
  })

  it("rejects shared and development credentials at plugin routes", () => {
    for (const authMethod of ["shared_token", "dev_local"] as const) {
      expect(() =>
        authorizeBumblebeeRoute(
          { audience: "bumblebee_runner", authMethod, expiresAt: null, revokedAt: null },
          "runs",
        ),
      ).toThrowError(BUMBLEBEE_AUTH_ERROR.credentialClass)
    }
  })

  it("allows runner only at runs and ingest only at ingest", () => {
    const runner = { audience: "bumblebee_runner" as const, authMethod: "plugin_token" as const, expiresAt: null, revokedAt: null }
    const ingest = { audience: "bumblebee_ingest" as const, authMethod: "plugin_token" as const, expiresAt: new Date(Date.now() + 60_000), revokedAt: null }

    expect(authorizeBumblebeeRoute(runner, "runs")).toBe("bumblebee_runner")
    expect(authorizeBumblebeeRoute(ingest, "ingest")).toBe("bumblebee_ingest")
    expect(() => authorizeBumblebeeRoute(runner, "ingest")).toThrowError(BUMBLEBEE_AUTH_ERROR.audience)
    expect(() => authorizeBumblebeeRoute(ingest, "runs")).toThrowError(BUMBLEBEE_AUTH_ERROR.audience)
  })

  it("refuses both valid plugin audiences at MCP and browser routes", () => {
    const now = new Date("2026-08-27T00:00:00Z")
    for (const audience of ["bumblebee_runner", "bumblebee_ingest"] as const) {
      const credential = {
        audience,
        authMethod: "plugin_token" as const,
        expiresAt: audience === "bumblebee_ingest" ? new Date("2026-08-27T00:01:00Z") : null,
        revokedAt: null,
      }
      expect(() => authorizeBumblebeeRoute(credential, "mcp", now)).toThrowError(BUMBLEBEE_AUTH_ERROR.audience)
      expect(() => authorizeBumblebeeRoute(credential, "browser", now)).toThrowError(BUMBLEBEE_AUTH_ERROR.audience)
    }
  })

  it("refuses expired, missing-expiry, malformed-expiry, or revoked plugin credentials before route dispatch", () => {
    expect(() => authorizeBumblebeeRoute({ audience: "bumblebee_runner", authMethod: "plugin_token", expiresAt: null, revokedAt: new Date() }, "runs"))
      .toThrowError(BUMBLEBEE_AUTH_ERROR.revoked)
    expect(() => authorizeBumblebeeRoute({ audience: "bumblebee_ingest", authMethod: "plugin_token", expiresAt: new Date(0), revokedAt: null }, "ingest", new Date(1)))
      .toThrowError(BUMBLEBEE_AUTH_ERROR.expired)
    expect(() => authorizeBumblebeeRoute({ audience: "bumblebee_ingest", authMethod: "plugin_token", expiresAt: null, revokedAt: null }, "ingest"))
      .toThrowError(BUMBLEBEE_AUTH_ERROR.expired)
    expect(() => authorizeBumblebeeRoute({ audience: "bumblebee_ingest", authMethod: "plugin_token", expiresAt: new Date("invalid"), revokedAt: null }, "ingest"))
      .toThrowError(BUMBLEBEE_AUTH_ERROR.expired)
  })
})

describe("Story 26.7 relational source/catalog contract", () => {
  const migration = join(process.cwd(), "docker/postgres-init/46-bumblebee-source-authority.sql")

  it("defines dedicated runner credentials and immutable scoped catalog/source revisions", () => {
    const sql = readFileSync(migration, "utf8")
    for (const table of [
      "bumblebee_runner_credentials",
      "bumblebee_catalog_revisions",
      "bumblebee_catalog_entries",
      "bumblebee_sources",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
    }
    expect(sql).toMatch(/audience\s+TEXT NOT NULL DEFAULT 'bumblebee_runner'[\s\S]*CHECK \(audience = 'bumblebee_runner'\)/)
    expect(sql).toContain("UNIQUE (group_id, workspace_id, catalog_revision_id, catalog_digest)")
    expect(sql).toContain("FOREIGN KEY (group_id, workspace_id, catalog_revision_id, catalog_digest)")
    expect(sql).toContain("FOREIGN KEY (group_id, workspace_id, runner_credential_id, runner_audience)")
    expect(sql).toContain("mode <> 'findings-only' OR findings_enabled")
    expect(sql).toContain("bumblebee_source_ecosystems_valid")
    expect(sql).toContain("token_prefix ~ '^bmb_runner_[A-Za-z0-9_-]{8}$'")
    for (const identity of [
      "credential_id",
      "catalog_revision_id",
      "catalog_entry_id",
      "source_id",
      "source_revision_id",
      "endpoint_device_id",
      "runner_credential_id",
    ]) {
      expect(sql).toContain(`${identity} TEXT NOT NULL CHECK (LENGTH(TRIM(${identity})) > 0)`)
    }
    expect(sql).toContain("catalog_revision_id IS NULL OR LENGTH(TRIM(catalog_revision_id)) > 0")
  })

  it("makes catalog and population identity append-only while permitting only source disable metadata", () => {
    const sql = readFileSync(migration, "utf8")
    expect(sql).toContain("prevent_bumblebee_immutable_mutation")
    expect(sql).toContain("protect_bumblebee_source_revision")
    expect(sql).toMatch(/NEW\.disabled_at[\s\S]*NEW\.disabled_by[\s\S]*NEW\.disable_reason/)
    expect(sql).toContain("GRANT SELECT, INSERT ON bumblebee_catalog_revisions, bumblebee_catalog_entries TO allura_app")
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON bumblebee_sources TO allura_app")
  })
})
