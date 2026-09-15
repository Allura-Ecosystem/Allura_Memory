/**
 * Story 29.5 — Device-limit unit tests (§4.2c, HIGH-F4).
 *
 * Unit-level: getDeviceLimit(), acquireDeviceCountLock SQL shape,
 * countApprovedDevices SQL shape. No real DB — mocked PoolClient.
 */
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

vi.mock("@/lib/device-pairing/config", () => ({
  getPairingCallbackAllowlist: vi.fn(() => ["deep_link", "loopback"]),
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.com"),
  getDeviceAuthAudience: vi.fn(() => "https://api.allura.example.com/device-auth"),
  getEnrollmentTtlMs: vi.fn(() => 10 * 60 * 1000),
}));

import {
  getDeviceLimit,
  acquireDeviceCountLock,
  countApprovedDevices,
  deviceLimitLockKey,
} from "@/lib/device-pairing/device-limit";

function makeMockClient() {
  const queryCalls: Array<{ text: string; params: unknown[] }> = [];
  const query = vi.fn(async (text: string, params?: unknown[]) => {
    queryCalls.push({ text, params: params ?? [] });
    return { rows: [{ count: 0 }], rowCount: 1 };
  });
  return { query, queryCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ALLURA_DEVICE_PAIRING_DEVICE_LIMIT;
});

describe("Story 29.5 — device-limit unit (§4.2c, HIGH-F4)", () => {
  describe("getDeviceLimit", () => {
    it("defaults to 5 when env is unset", () => {
      expect(getDeviceLimit()).toBe(5);
    });

    it("returns the configured value when ALLURA_DEVICE_PAIRING_DEVICE_LIMIT is a positive integer", () => {
      process.env.ALLURA_DEVICE_PAIRING_DEVICE_LIMIT = "3";
      expect(getDeviceLimit()).toBe(3);
    });

    it("falls back to 5 for non-numeric env values", () => {
      process.env.ALLURA_DEVICE_PAIRING_DEVICE_LIMIT = "abc";
      expect(getDeviceLimit()).toBe(5);
    });

    it("falls back to 5 for zero or negative values", () => {
      process.env.ALLURA_DEVICE_PAIRING_DEVICE_LIMIT = "0";
      expect(getDeviceLimit()).toBe(5);
      process.env.ALLURA_DEVICE_PAIRING_DEVICE_LIMIT = "-1";
      expect(getDeviceLimit()).toBe(5);
    });
  });

  describe("deviceLimitLockKey", () => {
    it("maps high-bit digest values into PostgreSQL's signed bigint range", () => {
      // This tuple is deliberately pinned to a SHA-256 prefix above 2^63.
      const key = deviceLimitLockKey("allura-high", "ws-high", "user-1");
      expect(key).toBeLessThan(0n);
      expect(key).toBeGreaterThanOrEqual(-(1n << 63n));
      expect(key).toBeLessThanOrEqual((1n << 63n) - 1n);
    });

    it("returns a stable 64-bit integer for a (group, workspace, principal) tuple", () => {
      const k1 = deviceLimitLockKey("allura-acme", "ws-a", "user_123");
      const k2 = deviceLimitLockKey("allura-acme", "ws-a", "user_123");
      expect(k1).toBe(k2);
      expect(typeof k1).toBe("bigint");
    });

    it("returns different keys for different principals", () => {
      const k1 = deviceLimitLockKey("allura-acme", "ws-a", "user_123");
      const k2 = deviceLimitLockKey("allura-acme", "ws-a", "user_456");
      expect(k1).not.toBe(k2);
    });

    it("returns different keys for different workspaces", () => {
      const k1 = deviceLimitLockKey("allura-acme", "ws-a", "user_123");
      const k2 = deviceLimitLockKey("allura-acme", "ws-b", "user_123");
      expect(k1).not.toBe(k2);
    });

    it("returns different keys for different groups", () => {
      const k1 = deviceLimitLockKey("allura-acme", "ws-a", "user_123");
      const k2 = deviceLimitLockKey("allura-beta", "ws-a", "user_123");
      expect(k1).not.toBe(k2);
    });
  });

  describe("acquireDeviceCountLock", () => {
    it("issues pg_advisory_xact_lock with the derived 64-bit key", async () => {
      const client = makeMockClient();
      await acquireDeviceCountLock(
        client as unknown as Parameters<typeof acquireDeviceCountLock>[0],
        "allura-acme",
        "ws-a",
        "user_123",
      );
      expect(client.queryCalls).toHaveLength(1);
      const call = client.queryCalls[0];
      expect(call.text).toContain("pg_advisory_xact_lock");
      // The key is passed as a bind param (bigint → string for pg)
      expect(call.params).toHaveLength(1);
      const key = deviceLimitLockKey("allura-acme", "ws-a", "user_123");
      expect(call.params[0]).toBe(key.toString());
    });
  });

  describe("countApprovedDevices", () => {
    it("queries paired_devices with group_id, workspace_id, principal_id, lifecycle_state=APPROVED", async () => {
      const client = makeMockClient();
      client.query.mockImplementation(async (text: string, params?: unknown[]) => {
        client.queryCalls.push({ text, params: params ?? [] });
        return { rows: [{ count: 2 }], rowCount: 1 };
      });

      const count = await countApprovedDevices(
        client as unknown as Parameters<typeof countApprovedDevices>[0],
        "allura-acme",
        "ws-a",
        "user_123",
      );

      expect(count).toBe(2);
      expect(client.queryCalls).toHaveLength(1);
      const call = client.queryCalls[0];
      expect(call.text).toContain("FROM paired_devices");
      expect(call.text).toContain("lifecycle_state");
      expect(call.text).toContain("APPROVED");
      expect(call.params).toEqual(["allura-acme", "ws-a", "user_123"]);
    });

    it("returns 0 when no rows match", async () => {
      const client = makeMockClient();
      client.query.mockImplementation(async (text: string, params?: unknown[]) => {
        client.queryCalls.push({ text, params: params ?? [] });
        return { rows: [{ count: 0 }], rowCount: 1 };
      });

      const count = await countApprovedDevices(
        client as unknown as Parameters<typeof countApprovedDevices>[0],
        "allura-acme",
        "ws-a",
        "user_123",
      );

      expect(count).toBe(0);
    });
  });
});