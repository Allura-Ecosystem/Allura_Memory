import { afterAll, beforeAll, expect, it } from "vitest";

import { issueChallenge } from "@/lib/device-pairing/challenge-service";
import { exchangeToken } from "@/lib/device-pairing/exchange-service";
import { createLiveDatabase, createSigningKey, seedApprovedDevice, signedExchangeInput } from "./live-fixtures";
import { describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("29.19 integration RFC 9421 target URI", () => {
  let db: MigrationDatabase;
  const signingKey = createSigningKey("kid-target-uri");

  beforeAll(async () => {
    db = await createLiveDatabase("rfc-target-uri");
    await seedApprovedDevice(db, {
      groupId: "allura-live-target-uri", workspaceId: "ws-live-target-uri",
      principalId: "principal-live-target-uri", deviceId: "dev-live-target-uri", signingKey,
    });
  }, 120_000);
  afterAll(async () => db?.close());

  it("binds the configured-origin target URI and refuses an actual route rewrite", async () => {
    const challenge = await issueChallenge(db.app, { device_id: "dev-live-target-uri", purpose: "exchange" });
    const input = signedExchangeInput({
      signingKey, deviceId: "dev-live-target-uri", challengeId: challenge.challenge_id,
      nonce: challenge.nonce, signedTarget: "/api/device-pairing/exchange",
      requestTarget: "/api/device-pairing/recovery",
    });
    await expect(exchangeToken(db.app, input)).rejects.toMatchObject({ code: "AUTH_INVALID" });
    const persisted = await db.owner.query("SELECT consumed_at FROM device_challenges WHERE id = $1", [challenge.challenge_id]);
    expect(persisted.rows).toEqual([{ consumed_at: null }]);
  });
});
