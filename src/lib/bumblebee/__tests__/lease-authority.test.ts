import { describe, expect, it } from "vitest"

import { issueScanLease, tokenPrefix } from "../lease-authority"

describe("Story 26.7 scan lease authority", () => {
  it("mints a finite ingest credential and delegates generation to locked server state", async () => {
    process.env.BUMBLEBEE_TOKEN_SECRET = "unit-test-secret-at-least-16"
    let persistedHash = ""
    const lease = await issueScanLease({
      runnerToken: "bmb_runner_abcdefgh_body",
      sourceId: "source-1",
      sourceRevisionId: "revision-1",
      durationSeconds: 120,
    }, {
      now: () => new Date("2026-08-28T12:00:00Z"),
      authenticateRunner: async () => ({
        credentialId: "runner-1", groupId: "allura-system", workspaceId: "ws-1",
        sourceId: "source-1", sourceRevisionId: "revision-1",
      }),
      persistLease: async (input) => {
        persistedHash = input.ingestTokenHash
        return { leaseId: "lease-1", generation: 7 }
      },
    })

    expect(lease.generation).toBe(7)
    expect(lease.ingestToken).toMatch(/^bmb_ingest_/)
    expect(lease.expiresAt.toISOString()).toBe("2026-08-28T12:02:00.000Z")
    expect(persistedHash).toMatch(/^[a-f0-9]{64}$/)
    expect(persistedHash).not.toContain(lease.ingestToken)
  })

  it("distinguishes a valid opposite token namespace as wrong audience", () => {
    expect(() => tokenPrefix("bmb_ingest_abcdefgh_body", "bumblebee_runner"))
      .toThrowError("BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN")
    expect(() => tokenPrefix("bmb_runner_abcdefgh_body", "bumblebee_ingest"))
      .toThrowError("BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN")
  })
})
