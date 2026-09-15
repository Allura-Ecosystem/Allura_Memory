import { afterAll, beforeAll, expect, it } from "vitest";

import { issueChallenge } from "@/lib/device-pairing/challenge-service";
import { exchangeToken } from "@/lib/device-pairing/exchange-service";
import { createLiveDatabase, createSigningKey, seedApprovedDevice, signedExchangeInput } from "./live-fixtures";
import { describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("29.19 integration grace recovery only", () => {
  let db: MigrationDatabase;
  const oldKey = createSigningKey("kid-grace");
  const currentKey = createSigningKey("kid-grace");

  beforeAll(async () => {
    db = await createLiveDatabase("grace-recovery-only");
    await seedApprovedDevice(db, {
      groupId: "allura-live-grace", workspaceId: "ws-live-grace", principalId: "principal-live-grace",
      deviceId: "dev-live-grace", signingKey: currentKey, graceExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  }, 120_000);
  afterAll(async () => db?.close());

  it("fails closed: an old key in a populated grace window cannot mint normal MCP access", async () => {
    const challenge = await issueChallenge(db.app, { device_id: "dev-live-grace", purpose: "exchange" });
    await expect(exchangeToken(db.app, signedExchangeInput({
      signingKey: oldKey, deviceId: "dev-live-grace", challengeId: challenge.challenge_id, nonce: challenge.nonce,
    }))).rejects.toMatchObject({ code: "AUTH_INVALID" });
    const [device, tokens, persistedChallenge] = await Promise.all([
      db.owner.query("SELECT grace_exchange_count FROM paired_devices WHERE id = 'dev-live-grace'"),
      db.owner.query("SELECT id FROM mcp_tokens WHERE paired_device_id = 'dev-live-grace'"),
      db.owner.query("SELECT consumed_at FROM device_challenges WHERE id = $1", [challenge.challenge_id]),
    ]);
    expect(device.rows).toEqual([{ grace_exchange_count: 0 }]);
    expect(tokens.rows).toHaveLength(0);
    expect(persistedChallenge.rows).toEqual([{ consumed_at: null }]);
  });
});
