import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthAudience: vi.fn(() => "https://device-auth.example.test"),
}));
vi.mock("@/lib/device-pairing/audit", () => ({
  emitDeviceAudit: vi.fn(),
}));

import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import { issueChallenge } from "@/lib/device-pairing/challenge-service";

describe("Story 29.7 — challenge service", () => {
  it("issues the first rotation_stage challenge before a pending key exists", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) {
          return { rows: [{ id: "dev-approved", principal_id: "principal-1", workspace_id: "ws-1", lifecycle_state: "APPROVED", key_generation: 4, pending_next_public_key: null }] };
        }
        if (text.includes("INSERT INTO device_challenges")) return { rows: [{ id: "challenge-first-rotation", expires_at: "2026-09-10T10:39:20.000Z" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    await expect(issueChallenge({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-approved",
      purpose: "rotation_stage",
    })).resolves.toMatchObject({ challenge_id: "challenge-first-rotation", purpose: "rotation_stage" });

    expect(calls.some((text) => text.includes("INSERT INTO device_challenges"))).toBe(true);
    expect(calls).toContain("COMMIT");
  });

  it("bootstraps RLS and issues a privacy-safe exchange challenge for an approved device", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const expiresAt = "2026-09-09T10:39:20.000Z";
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) {
          return { rows: [{ id: "dev-approved", principal_id: "principal-1", workspace_id: "ws-1", lifecycle_state: "APPROVED", key_generation: 4 }] };
        }
        if (text.includes("INSERT INTO device_challenges")) {
          return { rows: [{ id: "challenge-1", expires_at: expiresAt }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    const result = await issueChallenge(pool as never, {
      device_id: "dev-approved",
      purpose: "exchange",
    });

    expect(result).toMatchObject({
      challenge_id: "challenge-1",
      audience: "https://device-auth.example.test",
      purpose: "exchange",
      expires_at: expiresAt,
      server_context: { device_id: "dev-approved", key_generation: 4 },
    });
    expect(result.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.server_context).not.toHaveProperty("principal_id");
    expect(result.server_context).not.toHaveProperty("group_id");
    expect(result.server_context).not.toHaveProperty("workspace_id");
    expect(calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("set_config('app.current_group_id'"),
      params: ["allura-faithmeats"],
    }));
    expect(calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("set_config('app.current_workspace_id'"),
      params: ["ws-1"],
    }));
    expect(calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("set_config('app.current_principal'"),
      params: ["principal-1"],
    }));
    expect(calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("INSERT INTO device_challenges"),
      params: expect.arrayContaining(["allura-faithmeats", "dev-approved", "https://device-auth.example.test", "exchange"]),
    }));
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-faithmeats",
      workspace_id: "ws-1",
      agent_id: "principal-1",
      event_type: "DEVICE_CHALLENGE_ISSUED",
    }));
    expect(calls.map((call) => call.text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
  });

  it("audits and rejects an unresolved device without inserting a challenge", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: null }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    await expect(issueChallenge(pool as never, {
      device_id: "dev-missing",
      purpose: "exchange",
    })).rejects.toMatchObject({
      code: "DEVICE_NOT_APPROVED",
    });

    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-system",
      agent_id: "device-enrollment",
      event_type: "DEVICE_EXCHANGE_DENIED",
      workspace_id: null,
      metadata: { device_id: "dev-missing", reason_code: "DEVICE_NOT_APPROVED" },
    }));
    expect(calls.some((call) => call.text.includes("INSERT INTO device_challenges"))).toBe(false);
    expect(calls.map((call) => call.text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(client.release).toHaveBeenCalledOnce();
  });
});
