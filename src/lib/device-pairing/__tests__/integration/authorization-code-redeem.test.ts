import { afterAll, beforeAll, expect, it } from "vitest";

import { hashAuthorizationCode } from "@/lib/device-pairing/authorization-code";
import { completePairing } from "@/lib/device-pairing/complete-service";
import { computePkceCodeChallengeS256 } from "@/lib/device-pairing/pkce";
import { createLiveDatabase, createSigningKey, signedCompleteInput } from "./live-fixtures";
import { describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("29.19 integration authorization-code redemption", () => {
  let db: MigrationDatabase;
  const enrollmentId = "enroll-live-code-redeem";
  const groupId = "allura-live-code-redeem";
  const workspaceId = "ws-live-code-redeem";
  const principalId = "principal-live-code-redeem";
  const authorizationCode = "authorization-code-live-redeem";
  const completionNonce = "completion-nonce-live-redeem";
  const pkceVerifier = "pkce-verifier-live-redeem";
  const signingKey = createSigningKey("kid-code-redeem");

  beforeAll(async () => {
    db = await createLiveDatabase("authorization-code-redeem");
    await db.owner.query("INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, 'Code redemption workspace')", [workspaceId, groupId]);
    await db.owner.query("INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'curator')", [groupId, principalId, "code-redeem@integration.test"]);
    await db.app.query("SELECT set_config('app.current_principal', $1, false)", [principalId]);
    await db.app.query("SELECT set_config('app.current_group_id', $1, false)", [groupId]);
    await db.app.query("SELECT set_config('app.current_workspace_id', $1, false)", [workspaceId]);
    await db.app.query(
      "SELECT device_enrollment_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() + INTERVAL '10 minutes')",
      [enrollmentId, "Code redemption device", signingKey.publicKeyPem, signingKey.keyId, "ecdsa-p256", computePkceCodeChallengeS256(pkceVerifier), "S256", "code-redeem-state", "loopback", "http://127.0.0.1:54329/callback"],
    );
    await db.app.query(
      "SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [enrollmentId, "code-redeem-state", principalId, groupId, workspaceId, hashAuthorizationCode(authorizationCode), new Date(Date.now() + 60_000), completionNonce, new Date(Date.now() + 60_000)],
    );
  }, 120_000);
  afterAll(async () => db?.close());

  it("redeems the one-time authorization code once through completePairing and stores only its hash", async () => {
    const result = await completePairing(db.app, signedCompleteInput({ signingKey, enrollmentId, authorizationCode, completionNonce, pkceVerifier }));
    await expect(completePairing(db.app, signedCompleteInput({ signingKey, enrollmentId, authorizationCode, completionNonce, pkceVerifier }))).rejects.toMatchObject({ code: "ENROLLMENT_CONSUMED" });
    const [enrollment, token] = await Promise.all([
      db.owner.query("SELECT state, authorization_code_hash, authorization_code_consumed_at FROM device_enrollments WHERE id = $1", [enrollmentId]),
      db.owner.query("SELECT paired_device_id FROM mcp_tokens WHERE paired_device_id = $1", [result.device_id]),
    ]);
    expect(enrollment.rows[0]).toMatchObject({ state: "CONSUMED", authorization_code_hash: hashAuthorizationCode(authorizationCode) });
    expect(enrollment.rows[0]?.authorization_code_hash).not.toContain(authorizationCode);
    expect(enrollment.rows[0]?.authorization_code_consumed_at).toBeTruthy();
    expect(token.rows).toEqual([{ paired_device_id: result.device_id }]);
  });
});
