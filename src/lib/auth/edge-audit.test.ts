/**
 * Edge-Audit verdict → status mapping tests (regression for chk_events_valid_status)
 *
 * Bug: emitGatedAudit passed the auth verdict ("authorized" | "unauthorized" |
 * "forbidden") straight into events.status, but the DB CHECK constraint
 * chk_events_valid_status only permits 'pending' | 'completed' | 'failed' |
 * 'cancelled'. Every gated request 500'd on /api/trace and dropped the audit row.
 *
 * These tests pin: (1) the verdict→status mapping always yields a constraint-valid
 * status, and (2) the original verdict is preserved in metadata.verdict.
 */

import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { buildGatedAuditPayload, verdictToStatus } from "./edge-audit"

const VALID_STATUSES = new Set(["pending", "completed", "failed", "cancelled"])
const VERDICTS = ["authorized", "unauthorized", "forbidden"] as const

function req(path = "/dashboard", method = "GET"): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3100"), { method })
}

describe("edge-audit verdict → status mapping", () => {
  it("maps every auth verdict to a constraint-valid status", () => {
    for (const verdict of VERDICTS) {
      expect(VALID_STATUSES.has(verdictToStatus(verdict))).toBe(true)
    }
  })

  it("authorized → completed, denials → failed", () => {
    expect(verdictToStatus("authorized")).toBe("completed")
    expect(verdictToStatus("unauthorized")).toBe("failed")
    expect(verdictToStatus("forbidden")).toBe("failed")
  })

  it("payload status is always valid and preserves the verdict in metadata", () => {
    for (const verdict of VERDICTS) {
      const payload = buildGatedAuditPayload(req(), "dashboard", verdict, "authenticated", "admin")
      expect(VALID_STATUSES.has(payload.status)).toBe(true)
      expect(payload.metadata.verdict).toBe(verdict)
      expect(payload.event_type).toBe("api_request_gated")
      expect(payload.group_id).toBe("allura-system")
    }
  })
})
