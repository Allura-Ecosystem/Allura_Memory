import { describe, expect, it, vi } from "vitest";
import { deriveScopesForMembershipRole } from "@/lib/auth/scope-derivation";
import { createDeviceToken } from "@/lib/mcp-token/repository";

type LockMode = "normal" | "read_only" | "no_agent_writes" | "no_promotions" | "full_lockdown";

function startMintForLockMode(lock_mode: LockMode) {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queries.push({ text, params });
      if (text.includes("FROM paired_devices")) {
        return { rows: [{ principal_id: "human-1", group_id: "allura-test", workspace_id: "ws-1" }] };
      }
      if (text.includes("INSERT INTO mcp_tokens")) {
        return { rows: [{ id: "tok-1", expires_at: "2026-09-11T12:00:00.000Z" }] };
      }
      return { rows: [] };
    }),
  };

  const result = createDeviceToken(client as never, {
    paired_device_id: "dev-1",
    membership_role: "admin",
    lock_mode,
    expires_at: "2026-09-11T12:00:00.000Z",
  });
  return { result, queries };
}

async function mintForLockMode(lock_mode: LockMode) {
  const attempt = startMintForLockMode(lock_mode);
  await attempt.result;
  return {
    insert: attempt.queries.find(({ text }) => text.includes("INSERT INTO mcp_tokens")),
    queries: attempt.queries,
  };
}

describe("createDeviceToken workspace lock policy", () => {
  it("keeps the membership role scopes in normal mode", async () => {
    const { insert } = await mintForLockMode("normal");

    expect(insert?.params?.[6]).toEqual(deriveScopesForMembershipRole("admin"));
  });

  it.each(["read_only", "no_agent_writes"] as const)("limits %s mode to read and audit scopes", async (lock_mode) => {
    const { insert } = await mintForLockMode(lock_mode);

    expect(insert?.params?.[6]).toEqual(["memory:read", "audit:read"]);
  });

  it("removes promotion and review-decision scopes in no-promotions mode", async () => {
    const { insert } = await mintForLockMode("no_promotions");
    const scopes = insert?.params?.[6] as string[];

    expect(scopes).toEqual(deriveScopesForMembershipRole("admin").filter((scope) =>
      !["memory:promote", "review:approve", "review:reject"].includes(scope),
    ));
  });

  it("fails closed without inserting a token in full-lockdown mode", async () => {
    const attempt = startMintForLockMode("full_lockdown");

    await expect(attempt.result).rejects.toThrow(/locked/i);
    expect(attempt.queries.some(({ text }) => text.includes("INSERT INTO mcp_tokens"))).toBe(false);
  });
});
