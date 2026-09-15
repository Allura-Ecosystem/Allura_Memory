import { afterAll, beforeAll, expect, it } from "vitest";

import { clearAuthConfig } from "@/lib/auth/config";
import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import { ExchangeError, exchangeToken } from "@/lib/device-pairing/exchange-service";
import {
  createExchangeFixture,
  EXCHANGE_AUDIENCE,
  EXCHANGE_ORIGIN,
  type ExchangeFixture,
  openSeparateExchangeConnection,
  signedExchangeInput,
} from "./exchange-live-fixture";
import { describeMigrationLive } from "../migrations/postgres-test-harness";

const CONCURRENT_EXCHANGES = 8;

const originalEnv = {
  audience: process.env.ALLURA_DEVICE_AUTH_AUDIENCE,
  baseUrl: process.env.ALLURA_MCP_BASE_URL,
  origin: process.env.ALLURA_DEVICE_AUTH_ORIGIN,
  tokenSecret: process.env.ALLURA_MCP_TOKEN_SECRET,
};

function restoreEnv(): void {
  for (const [name, value] of Object.entries({
    ALLURA_DEVICE_AUTH_AUDIENCE: originalEnv.audience,
    ALLURA_MCP_BASE_URL: originalEnv.baseUrl,
    ALLURA_DEVICE_AUTH_ORIGIN: originalEnv.origin,
    ALLURA_MCP_TOKEN_SECRET: originalEnv.tokenSecret,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  clearAuthConfig();
  clearDevicePairingConfig();
}

describeMigrationLive("Story 29.19 exchange atomicity against real PostgreSQL", () => {
  let fixture: ExchangeFixture;

  beforeAll(async () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = EXCHANGE_ORIGIN;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = EXCHANGE_AUDIENCE;
    process.env.ALLURA_MCP_BASE_URL = "https://mcp.exchange.integration.test";
    process.env.ALLURA_MCP_TOKEN_SECRET = "exchange-atomicity-integration-test-secret";
    clearAuthConfig();
    clearDevicePairingConfig();
    fixture = await createExchangeFixture("atomicity");
  }, 120_000);

  afterAll(async () => {
    await fixture?.db.close();
    restoreEnv();
  });

  it("allows only one of N simultaneous signed exchanges and preserves one active token, one consumed challenge, and one allowed outcome", async () => {
    const input = signedExchangeInput(fixture);
    const pools = Array.from(
      { length: CONCURRENT_EXCHANGES },
      () => openSeparateExchangeConnection(fixture.db.databaseName),
    );

    try {
      const outcomes = await Promise.allSettled(pools.map((pool) => exchangeToken(pool, input)));
      const succeeded = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof exchangeToken>>> => outcome.status === "fulfilled");
      const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");

      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(CONCURRENT_EXCHANGES - 1);
      expect(rejected.every((outcome) => outcome.reason instanceof ExchangeError && outcome.reason.code === "AUTH_EXPIRED")).toBe(true);
      expect(new Set(succeeded.map((outcome) => outcome.value.access_token)).size).toBe(1);

      const [tokens, challenge, allowedEvents] = await Promise.all([
        fixture.db.owner.query<{ total: string; active: string }>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE revoked_at IS NULL)::text AS active
             FROM mcp_tokens
            WHERE paired_device_id = $1`,
          [fixture.deviceId],
        ),
        fixture.db.owner.query<{ consumed_by_token_id: string | null; consumed: boolean }>(
          `SELECT consumed_by_token_id, consumed_at IS NOT NULL AS consumed
             FROM device_challenges
            WHERE id = $1`,
          [fixture.challengeId],
        ),
        fixture.db.owner.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM events
            WHERE event_type = 'DEVICE_EXCHANGE_ALLOWED'
              AND metadata->>'device_id' = $1`,
          [fixture.deviceId],
        ),
      ]);

      expect(tokens.rows).toEqual([{ total: "2", active: "1" }]);
      expect(challenge.rows).toEqual([{ consumed: true, consumed_by_token_id: expect.any(String) }]);
      expect(allowedEvents.rows).toEqual([{ count: "1" }]);
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
    }
  });
});
