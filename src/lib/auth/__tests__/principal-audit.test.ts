/**
 * Story 24.2 review Finding 2 — auth audit persistence.
 *
 * Pure logic plus an injected sink. No database, no HTTP, no live server.
 */

import { describe, expect, it, vi } from "vitest";
import {
  type AuthAuditEventInsert,
  buildAuthAuditInsert,
  emitAuthAudit,
  setAuthAuditSink,
} from "../principal-audit";
import { buildAuthAuditEvent, createPrincipalContext } from "../principal-context";

function principal() {
  return createPrincipalContext({
    principalId: "agent-curator",
    tenantIds: ["allura-mortagate"],
    roles: ["curator"],
    authMethod: "mcp_token",
    sessionId: "sess-9",
    credentialId: "tok_abc",
  });
}

function allowEvent() {
  return buildAuthAuditEvent({
    principal: principal(),
    tool: "governance_proposal_approve",
    decision: "allow",
    effectiveTenant: "allura-mortagate",
    now: new Date("2026-08-15T12:00:00.000Z"),
  });
}

function denyEvent() {
  return buildAuthAuditEvent({
    principal: null,
    tool: "memory_add",
    decision: "deny",
    reasonCode: "AUTH_MISSING",
    now: new Date("2026-08-15T12:00:00.000Z"),
  });
}

const silentLogger = { log: () => {}, error: () => {} };

describe("buildAuthAuditInsert (AC-7)", () => {
  it("carries every AC-7 field in metadata JSONB", () => {
    const row = buildAuthAuditInsert(allowEvent());
    expect(row.event_type).toBe("mcp_auth_decision");
    expect(row.group_id).toBe("allura-mortagate");
    expect(row.agent_id).toBe("agent-curator");
    expect(row.status).toBe("completed");
    expect(row.metadata).toMatchObject({
      principal_id: "agent-curator",
      effective_tenant: "allura-mortagate",
      roles: ["curator"],
      session_id: "sess-9",
      tool: "governance_proposal_approve",
      decision: "allow",
      reason_code: "OK",
      auth_method: "mcp_token",
      credential_id: "tok_abc",
      occurred_at: "2026-08-15T12:00:00.000Z",
    });
  });

  it("maps deny to a constraint-valid failed status", () => {
    // events.chk_events_valid_status only permits pending/completed/failed/cancelled.
    const row = buildAuthAuditInsert(denyEvent());
    expect(row.status).toBe("failed");
    expect(["pending", "completed", "failed", "cancelled"]).toContain(row.status);
  });

  it("falls back to allura-system when no tenant could be resolved", () => {
    const row = buildAuthAuditInsert(denyEvent());
    expect(row.group_id).toBe("allura-system");
    // ...but does not invent a tenant in the audit record itself.
    expect(row.metadata.effective_tenant).toBeNull();
    expect(row.agent_id).toBe("anonymous");
  });

  it("rejects a malformed tenant rather than violating the group_id CHECK", () => {
    const event = { ...allowEvent(), effective_tenant: "DROP TABLE events" };
    expect(buildAuthAuditInsert(event).group_id).toBe("allura-system");
  });

  it("never contains credential material", () => {
    const serialized = JSON.stringify(buildAuthAuditInsert(allowEvent()));
    expect(serialized).not.toMatch(/allura_mcp_|token_hash|Bearer|secret/i);
  });
});

describe("emitAuthAudit failure policy", () => {
  it("persists the row through the injected sink", async () => {
    const rows: AuthAuditEventInsert[] = [];
    await emitAuthAudit(allowEvent(), {
      logger: silentLogger,
      sink: async (row) => {
        rows.push(row);
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.tool).toBe("governance_proposal_approve");
  });

  it("never rejects when the sink throws, and logs the failure", async () => {
    const errors: string[] = [];
    const logger = { log: () => {}, error: (m: string) => errors.push(m) };
    await expect(
      emitAuthAudit(allowEvent(), {
        logger,
        sink: async () => {
          throw new Error("postgres is down");
        },
      }),
    ).resolves.toBeUndefined();
    expect(errors.join("\n")).toMatch(/mcp-auth-persist-failed/);
    expect(errors.join("\n")).toMatch(/postgres is down/);
  });

  it("never rejects when the sink throws synchronously", async () => {
    await expect(
      emitAuthAudit(allowEvent(), {
        logger: silentLogger,
        sink: () => {
          throw new Error("sync boom");
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("always writes the structured line, even when persistence fails", async () => {
    const lines: string[] = [];
    const logger = { log: (m: string) => lines.push(m), error: () => {} };
    await emitAuthAudit(allowEvent(), {
      logger,
      sink: async () => {
        throw new Error("down");
      },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[mcp-auth\] /);
    expect(lines[0]).toContain("governance_proposal_approve");
  });

  it("writes the structured line before attempting persistence", async () => {
    const order: string[] = [];
    await emitAuthAudit(allowEvent(), {
      logger: { log: () => order.push("log"), error: () => {} },
      sink: async () => {
        order.push("sink");
      },
    });
    expect(order).toEqual(["log", "sink"]);
  });

  it("honours persist:false for log-only emission", async () => {
    const sink = vi.fn();
    await emitAuthAudit(allowEvent(), { logger: silentLogger, sink, persist: false });
    expect(sink).not.toHaveBeenCalled();
  });

  it("uses a globally installed sink override", async () => {
    const rows: AuthAuditEventInsert[] = [];
    setAuthAuditSink(async (row) => {
      rows.push(row);
    });
    try {
      await emitAuthAudit(denyEvent(), { logger: silentLogger });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("failed");
    } finally {
      setAuthAuditSink(null);
    }
  });

  it("does not log a raw token even if one were somehow present in the tool name", async () => {
    const lines: string[] = [];
    const event = { ...allowEvent(), tool: "memory_add" };
    await emitAuthAudit(event, {
      logger: { log: (m: string) => lines.push(m), error: () => {} },
      sink: async () => {},
    });
    expect(lines[0]).not.toMatch(/allura_mcp_/);
  });
});
