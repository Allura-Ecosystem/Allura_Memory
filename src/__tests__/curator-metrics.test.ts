/**
 * Story 21.5: Curation Metrics Endpoint — Unit Tests
 * ============================================================================
 * Tests GET /api/curator/metrics with mocked pool and sentry.
 * Verifies: correct metrics calculated, group_id enforced, empty tenant
 * returns zeros, invalid group_id rejected.
 *
 * These tests run in the unit lane (no DB, no external services).
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock external dependencies ────────────────────────────────────────────────

const queryMock = vi.fn();

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({ query: queryMock })),
}));

vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(),
}));

// Import after mocks
import { GET } from "@/app/api/curator/metrics/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(groupId?: string): NextRequest {
  const url = groupId
    ? `http://localhost/api/curator/metrics?group_id=${groupId}`
    : "http://localhost/api/curator/metrics";
  return new NextRequest(url);
}

/** Set up the 4 sequential query mocks for the metrics endpoint. */
function setupQueryMocks(
  pending: { count: number; oldestAgeHours: number },
  rates: { approved: number; rejected: number; total: number },
  drift: { hasAudit: boolean; checksFailed: number },
  watchdog: { hasHeartbeat: boolean; heartbeatAgeMinutes: number },
) {
  queryMock
    // Query 1: pending proposals
    .mockResolvedValueOnce({
      rows: [
        {
          pending_count: String(pending.count),
          oldest_age_hours: pending.count > 0 ? String(pending.oldestAgeHours) : "0",
        },
      ],
    })
    // Query 2: promotion/rejection rates
    .mockResolvedValueOnce({
      rows: [
        {
          approved: String(rates.approved),
          rejected: String(rates.rejected),
          total_decisions: String(rates.total),
        },
      ],
    })
    // Query 3: drift audit status
    .mockResolvedValueOnce({
      rows: drift.hasAudit
        ? [{ metadata: { checks_failed: drift.checksFailed } }]
        : [],
    })
    // Query 4: watchdog health
    .mockResolvedValueOnce({
      rows: watchdog.hasHeartbeat
        ? [{
            created_at: new Date(
              Date.now() - watchdog.heartbeatAgeMinutes * 60 * 1000,
            ).toISOString(),
          }]
        : [],
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Story 21.5: Curation Metrics Endpoint", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  // ── group_id validation ──────────────────────────────────────────────────

  it("returns 400 when group_id is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("group_id is required");
  });

  it("returns 400 for an invalid group_id format", async () => {
    const res = await GET(makeRequest("invalid-id"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid group_id");
  });

  it("returns 400 for group_id without allura- prefix", async () => {
    const res = await GET(makeRequest("my-project"));
    expect(res.status).toBe(400);
  });

  // ── Correct metrics calculation ──────────────────────────────────────────

  it("returns correct metrics for a tenant with data", async () => {
    setupQueryMocks(
      { count: 5, oldestAgeHours: 12.5 },
      { approved: 8, rejected: 2, total: 10 },
      { hasAudit: true, checksFailed: 0 },
      { hasHeartbeat: true, heartbeatAgeMinutes: 3 },
    );

    const res = await GET(makeRequest("allura-system"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.group_id).toBe("allura-system");
    expect(body.pending_proposals).toBe(5);
    expect(body.oldest_proposal_age_hours).toBe(12.5);
    expect(body.auto_promotion_rate_24h).toBe(80); // 8/10 = 80%
    expect(body.rejection_rate_24h).toBe(20); // 2/10 = 20%
    expect(body.drift_audit_status).toBe("pass");
    expect(body.watchdog_health).toBe("running");
  });

  it("returns drift_audit_status=fail when checks_failed > 0", async () => {
    setupQueryMocks(
      { count: 0, oldestAgeHours: 0 },
      { approved: 0, rejected: 0, total: 0 },
      { hasAudit: true, checksFailed: 2 },
      { hasHeartbeat: false, heartbeatAgeMinutes: 0 },
    );

    const res = await GET(makeRequest("allura-system"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.drift_audit_status).toBe("fail");
    expect(body.watchdog_health).toBe("stopped");
  });

  it("returns drift_audit_status=unknown when no audit event exists", async () => {
    setupQueryMocks(
      { count: 0, oldestAgeHours: 0 },
      { approved: 0, rejected: 0, total: 0 },
      { hasAudit: false, checksFailed: 0 },
      { hasHeartbeat: false, heartbeatAgeMinutes: 0 },
    );

    const res = await GET(makeRequest("allura-system"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.drift_audit_status).toBe("unknown");
  });

  it("returns watchdog_health=stopped when heartbeat is older than 10 minutes", async () => {
    setupQueryMocks(
      { count: 0, oldestAgeHours: 0 },
      { approved: 0, rejected: 0, total: 0 },
      { hasAudit: false, checksFailed: 0 },
      { hasHeartbeat: true, heartbeatAgeMinutes: 15 },
    );

    const res = await GET(makeRequest("allura-system"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.watchdog_health).toBe("stopped");
  });

  // ── Empty tenant returns zeros ────────────────────────────────────────────

  it("returns zeros for empty tenant (no proposals, no events)", async () => {
    setupQueryMocks(
      { count: 0, oldestAgeHours: 0 },
      { approved: 0, rejected: 0, total: 0 },
      { hasAudit: false, checksFailed: 0 },
      { hasHeartbeat: false, heartbeatAgeMinutes: 0 },
    );

    const res = await GET(makeRequest("allura-empty"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.group_id).toBe("allura-empty");
    expect(body.pending_proposals).toBe(0);
    expect(body.oldest_proposal_age_hours).toBeNull();
    expect(body.auto_promotion_rate_24h).toBe(0);
    expect(body.rejection_rate_24h).toBe(0);
    expect(body.drift_audit_status).toBe("unknown");
    expect(body.watchdog_health).toBe("stopped");
  });

  // ── Read-only (no side effects) ───────────────────────────────────────────

  it("only executes SELECT queries (read-only, no side effects)", async () => {
    setupQueryMocks(
      { count: 1, oldestAgeHours: 2 },
      { approved: 1, rejected: 0, total: 1 },
      { hasAudit: true, checksFailed: 0 },
      { hasHeartbeat: true, heartbeatAgeMinutes: 1 },
    );

    await GET(makeRequest("allura-system"));

    // Verify all queries were SELECT-like (4 calls)
    expect(queryMock).toHaveBeenCalledTimes(4);

    // Check that no INSERT/UPDATE/DELETE was in any query
    for (const call of queryMock.mock.calls) {
      const sql = String(call[0] ?? "").toUpperCase();
      expect(sql).not.toContain("INSERT");
      expect(sql).not.toContain("UPDATE");
      expect(sql).not.toContain("DELETE");
    }
  });

  // ── Response includes timestamp ───────────────────────────────────────────

  it("includes a timestamp in the response", async () => {
    setupQueryMocks(
      { count: 0, oldestAgeHours: 0 },
      { approved: 0, rejected: 0, total: 0 },
      { hasAudit: false, checksFailed: 0 },
      { hasHeartbeat: false, heartbeatAgeMinutes: 0 },
    );

    const res = await GET(makeRequest("allura-system"));
    const body = await res.json();

    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it("returns 500 when database query fails", async () => {
    queryMock.mockRejectedValue(new Error("Connection refused"));

    const res = await GET(makeRequest("allura-system"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to fetch curation metrics");
  });
});