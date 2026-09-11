import { afterAll, beforeAll, expect, it } from "vitest";

import { issueChallenge } from "@/lib/device-pairing/challenge-service";
import { exchangeToken } from "@/lib/device-pairing/exchange-service";
import { createLiveDatabase, createSigningKey, seedApprovedDevice, signedExchangeInput } from "./live-fixtures";
import { describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("29.19 integration RFC 9421 body swap", () => {
  let db: MigrationDatabase;
  const signingKey = createSigningKey("kid-body-swap");

  beforeAll(async () => {
    db = await createLiveDatabase("rfc-body-swap");
    await seedApprovedDevice(db, {
      groupId: "allura-live-body-swap", workspaceId: "ws-live-body-swap",
      principalId: "principal-live-body-swap", deviceId: "dev-live-body-swap", signingKey,
    });
  }, 120_000);
  afterAll(async () => db?.close());

  it("rejects a swapped signed body without consuming the real PostgreSQL challenge", async () => {
    const challenge = await issueChallenge(db.app, { device_id: "dev-live-body-swap", purpose: "exchange" });
    const original = Buffer.from('{"device":"legitimate"}');
    const swapped = Buffer.from('{"device":"attacker"}');
    const input = signedExchangeInput({
      signingKey, deviceId: "dev-live-body-swap", challengeId: challenge.challenge_id,
      nonce: challenge.nonce, body: original,
    });
    input.request_body = swapped;
    await expect(exchangeToken(db.app, input)).rejects.toMatchObject({ code: "AUTH_INVALID" });
    const [challengeRow, tokenRows] = await Promise.all([
      db.owner.query("SELECT consumed_at FROM device_challenges WHERE id = $1", [challenge.challenge_id]),
      db.owner.query("SELECT id FROM mcp_tokens WHERE paired_device_id = $1", ["dev-live-body-swap"]),
    ]);
    expect(challengeRow.rows).toEqual([{ consumed_at: null }]);
    expect(tokenRows.rows).toHaveLength(0);
  });
});
