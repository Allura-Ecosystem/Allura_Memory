import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import { issueChallenge } from "@/lib/device-pairing/challenge-service";

type QueryCall = { text: string; params?: readonly unknown[] };

class RecordingClient {
  readonly calls: QueryCall[] = [];
  released = false;

  constructor(private readonly lifecycleState: "APPROVED" | "REVOKED") {}

  async query<T = unknown>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, params });
    if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-test" }] as T[] };
    if (text.includes("FROM paired_devices")) {
      return {
        rows: [{
          id: "device-state", principal_id: "principal-state", workspace_id: "workspace-state",
          lifecycle_state: this.lifecycleState, key_generation: 3,
        }] as T[],
      };
    }
    if (text.includes("INSERT INTO device_challenges")) {
      return { rows: [{ id: "challenge-state", expires_at: "2030-01-01T00:00:00.000Z" }] as T[] };
    }
    return { rows: [{}] as T[] };
  }

  release(): void {
    this.released = true;
  }
}

function poolFor(client: RecordingClient) {
  return { connect: async () => client };
}

afterEach(() => {
  clearDevicePairingConfig();
  delete process.env.ALLURA_DEVICE_AUTH_AUDIENCE;
});

describe("device lifecycle contracts", () => {
  it("executes issueChallenge only for an APPROVED device and records the tenant-bound challenge insert", async () => {
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = "https://device-auth.example.test";
    const client = new RecordingClient("APPROVED");

    const result = await issueChallenge(poolFor(client) as never, {
      device_id: "device-state",
      purpose: "rotation_stage",
    });

    expect(result).toMatchObject({
      challenge_id: "challenge-state",
      purpose: "rotation_stage",
      server_context: { device_id: "device-state", key_generation: 3 },
    });
    expect(client.calls.map(({ text }) => text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(client.calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("set_config('app.current_principal'"),
      params: ["principal-state"],
    }));
    const insert = client.calls.find(({ text }) => text.includes("INSERT INTO device_challenges"));
    expect(insert?.params?.slice(1, 6)).toEqual([
      "allura-test", "device-state", expect.any(String), "https://device-auth.example.test", "rotation_stage",
    ]);
    expect(client.released).toBe(true);
  });

  it("rejects a terminal REVOKED device before a challenge can be issued", async () => {
    const client = new RecordingClient("REVOKED");

    await expect(issueChallenge(poolFor(client) as never, {
      device_id: "device-state",
      purpose: "exchange",
    })).rejects.toMatchObject({ code: "DEVICE_NOT_APPROVED" });

    expect(client.calls.some(({ text }) => text.includes("INSERT INTO device_challenges"))).toBe(false);
    expect(client.calls.map(({ text }) => text)).toContain("ROLLBACK");
    expect(client.released).toBe(true);
  });

  it("keeps the database-only terminal transition trigger as supplemental migration coverage", () => {
    const migration = readFileSync("docker/postgres-init/69-device-revocation-lifecycle.sql", "utf8");

    expect(migration).toContain("paired_devices_reject_terminal_lifecycle_transition");
    expect(migration).toContain("lifecycle is terminal");
  });
});
