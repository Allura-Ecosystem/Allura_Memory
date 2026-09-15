import { afterAll, beforeAll, expect, it } from "vitest";

import { clearAuthConfig } from "@/lib/auth/config";
import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import { exchangeToken } from "@/lib/device-pairing/exchange-service";
import {
  createExchangeFixture,
  EXCHANGE_AUDIENCE,
  EXCHANGE_ORIGIN,
  type ExchangeFixture,
  openSeparateExchangeConnection,
  signedExchangeInput,
} from "./exchange-live-fixture";
import { describeMigrationLive } from "../migrations/postgres-test-harness";

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

describeMigrationLive("Story 29.19 exchange replay against real PostgreSQL", () => {
  let fixture: ExchangeFixture;

  beforeAll(async () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = EXCHANGE_ORIGIN;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = EXCHANGE_AUDIENCE;
    process.env.ALLURA_MCP_BASE_URL = "https://mcp.exchange.integration.test";
    process.env.ALLURA_MCP_TOKEN_SECRET = "exchange-replay-integration-test-secret";
    clearAuthConfig();
    clearDevicePairingConfig();
    fixture = await createExchangeFixture("replay");
  }, 120_000);

  afterAll(async () => {
    await fixture?.db.close();
    restoreEnv();
  });

  it("rejects a valid signed replay after first issuance without issuing another token or secret", async () => {
    const input = signedExchangeInput(fixture);
    const firstConnection = openSeparateExchangeConnection(fixture.db.databaseName);
    const replayConnection = openSeparateExchangeConnection(fixture.db.databaseName);

    try {
      const first = await exchangeToken(firstConnection, input);
      expect(first.access_token).toMatch(/^allura_mcp_/);

      await expect(exchangeToken(replayConnection, input)).rejects.toMatchObject({
        code: "AUTH_EXPIRED",
      });

      const [tokens, challenge, allowedEvents] = await Promise.all([
        fixture.db.owner.query<{ total: string; active: string }>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE revoked_at IS NULL)::text AS active
             FROM mcp_tokens
            WHERE paired_device_id = $1`,
          [fixture.deviceId],
        ),
        fixture.db.owner.query<{ consumed: boolean }>(
          "SELECT consumed_at IS NOT NULL AS consumed FROM device_challenges WHERE id = $1",
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
      expect(challenge.rows).toEqual([{ consumed: true }]);
      expect(allowedEvents.rows).toEqual([{ count: "1" }]);
    } finally {
      await Promise.all([firstConnection.end(), replayConnection.end()]);
    }
  });
});
