import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  scanCredentialSources,
  scanDeviceEventMetadata,
  scanStaticCredentialArtifacts,
} from "../../../../scripts/credential-scan";
import {
  CREDENTIAL_SCAN_ALLOWLIST,
  DEVICE_PAIRING_STATIC_ARTIFACTS,
} from "../../../../scripts/credential-scan-policy";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const FIXTURE_ROOT = "src/lib/device-pairing/__tests__/fixtures/credential-scan";

function fixture(relativePath: string): { path: string; text: string } {
  return {
    path: `${FIXTURE_ROOT}/${relativePath}`,
    text: readFileSync(path.join(REPO_ROOT, FIXTURE_ROOT, relativePath), "utf8"),
  };
}

describe("Story 29.17 — credential leak scanner", () => {
  it("detects credential values and sensitive metadata keys without echoing their values", () => {
    const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const rawMcpToken = ["allura_mcp_", "credentialleak000000"].join("");

    const findings = scanCredentialSources([
      { path: "events/metadata.json", text: JSON.stringify({ private_key: privateKeyHeader }) },
      { path: "errors/response.json", text: JSON.stringify({ token: rawMcpToken }) },
      { path: "logs/application.json", text: JSON.stringify({ clerk: "sk_test_synthetic" }) },
      { path: "events/pkce.json", text: JSON.stringify({ code_verifier: "synthetic" }) },
      { path: "events/nonces.json", text: JSON.stringify({ completion_nonce: "synthetic" }) },
      { path: "events/recovery.json", text: JSON.stringify({ rotation_secret: "synthetic" }) },
      { path: "logs/plain.log", text: "request failed: access_token=synthetic" },
    ]);

    expect(findings.map((finding) => finding.rule)).toEqual(expect.arrayContaining([
      "private-key-header",
      "secret-metadata-key",
      "allura-mcp-token",
      "clerk-key",
      "pkce-verifier-key",
      "completion-or-challenge-nonce-key",
      "rotation-or-recovery-secret-key",
    ]));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "logs/plain.log", rule: "secret-metadata-key" }),
    ]));
    expect(JSON.stringify(findings)).not.toContain(rawMcpToken);
  });

  it("scans only the named device-pairing static artifacts and accepts one exact documented sentinel", () => {
    expect(DEVICE_PAIRING_STATIC_ARTIFACTS).toHaveLength(4);
    expect(scanStaticCredentialArtifacts(REPO_ROOT)).toEqual([]);
  });

  it("fails an intentionally leaked device-pairing fixture when no exact allowlist entry applies", () => {
    const findings = scanCredentialSources([fixture("intentionally-leaked.json")]);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: `${FIXTURE_ROOT}/intentionally-leaked.json`,
        rule: "pkce-verifier-key",
      }),
    ]));
  });

  it("rejects wildcard, duplicate, non-test-path, and unused allowlist entries", () => {
    const sentinel = fixture("allowlisted-sentinel.json");

    expect(() => scanCredentialSources([sentinel], [
      ...CREDENTIAL_SCAN_ALLOWLIST,
      { path: `${FIXTURE_ROOT}/*`, literal: "allura_mcp_testfixture000000000000", reason: "wildcards are forbidden" },
    ])).toThrow(/wildcard/i);
    expect(() => scanCredentialSources([sentinel], [
      ...CREDENTIAL_SCAN_ALLOWLIST,
      CREDENTIAL_SCAN_ALLOWLIST[0]!,
    ])).toThrow(/duplicate/i);
    expect(() => scanCredentialSources([sentinel], [{
      path: "scripts/credential-scan.ts",
      literal: "allura_mcp_testfixture000000000000",
      reason: "non-test paths are forbidden",
    }])).toThrow(/test.*path/i);
    expect(() => scanCredentialSources([sentinel], [{
      path: sentinel.path,
      literal: "allura_mcp_unused000000000000",
      reason: "every entry must match a scanned literal",
    }])).toThrow(/unused/i);
  });

  it("scans persisted DEVICE_* metadata records through the reusable JSON walker", () => {
    const findings = scanDeviceEventMetadata([
      { event_type: "DEVICE_CHALLENGE_ISSUED", metadata: { challenge_nonce: "synthetic" } },
      { event_type: "DEVICE_ROTATION_RECOVERED", metadata: { recovery_secret: "synthetic" } },
    ]);

    expect(findings.map((finding) => finding.rule)).toEqual(expect.arrayContaining([
      "completion-or-challenge-nonce-key",
      "rotation-or-recovery-secret-key",
    ]));
  });
});
