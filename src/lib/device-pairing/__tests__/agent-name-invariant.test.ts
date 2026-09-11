import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createDeviceToken, type CreateDeviceTokenInput } from "@/lib/mcp-token/repository";

type QueryCall = { text: string; params?: readonly unknown[] };

class RecordingPoolClient {
  readonly calls: QueryCall[] = [];

  async query<T = unknown>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, params });
    if (text.includes("FROM paired_devices")) {
      return {
        rows: [{
          principal_id: "principal-from-locked-device",
          group_id: "allura-device-test",
          workspace_id: "workspace-device-test",
        }] as T[],
      };
    }
    if (text.includes("INSERT INTO mcp_tokens")) {
      return { rows: [{ id: "tok-device-test" }] as T[] };
    }
    return { rows: [] as T[] };
  }
}

describe("paired-device agent-name authority", () => {
  it("calls real createDeviceToken and inserts the locked device principal as agent_name", async () => {
    const client = new RecordingPoolClient();
    const input: CreateDeviceTokenInput = {
      paired_device_id: "device-authority-test",
      membership_role: "viewer",
      lock_mode: "normal",
      expires_at: "2030-01-01T00:00:00.000Z",
    };

    await createDeviceToken(client as never, input);

    const lookup = client.calls.find(({ text }) => text.includes("FROM paired_devices"));
    expect(lookup).toEqual(expect.objectContaining({
      text: expect.stringContaining("FOR UPDATE"),
      params: ["device-authority-test"],
    }));
    const insert = client.calls.find(({ text }) => text.includes("INSERT INTO mcp_tokens"));
    expect(insert?.params?.[1]).toBe("allura-device-test");
    expect(insert?.params?.[2]).toBe("workspace-device-test");
    expect(insert?.params?.[3]).toBe("principal-from-locked-device");
    expect(Object.keys(input).sort()).toEqual([
      "expires_at", "lock_mode", "membership_role", "paired_device_id",
    ]);
  });

  it("does not give the createDeviceToken caller an agent_name override parameter", () => {
    expectTypeOf<CreateDeviceTokenInput>().not.toHaveProperty("agent_name");
  });

  it("keeps the database trigger as supplemental cross-row invariant coverage", () => {
    const migration = readFileSync("docker/postgres-init/62-mcp-tokens-paired-device.sql", "utf8");
    const parentMigration = readFileSync("docker/postgres-init/70-paired-device-principal-immutability.sql", "utf8");

    expect(migration).toContain("verify_device_token_agent_name");
    expect(migration).toContain("trg_mcp_tokens_device_agent_name");
    expect(parentMigration).toContain("trg_paired_devices_reject_principal_change");
  });
});
