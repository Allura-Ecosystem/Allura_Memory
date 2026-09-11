export type CredentialScanAllowlistEntry = Readonly<{
  path: string;
  literal: string;
  reason: string;
}>;

/** Exact tracked test artifacts; no directory-level or glob discovery is allowed. */
export const DEVICE_PAIRING_STATIC_ARTIFACTS = [
  "src/lib/device-pairing/__tests__/fixtures/credential-scan/event-metadata.json",
  "src/lib/device-pairing/__tests__/fixtures/credential-scan/api-error.json",
  "src/lib/device-pairing/__tests__/fixtures/credential-scan/application-log.json",
  "src/lib/device-pairing/__tests__/fixtures/credential-scan/allowlisted-sentinel.json",
] as const;

/**
 * Synthetic data is permitted only where a negative-test sentinel proves that
 * the scanner's exemption is exact. The literal is not a credential.
 */
export const CREDENTIAL_SCAN_ALLOWLIST: readonly CredentialScanAllowlistEntry[] = [
  {
    path: "src/lib/device-pairing/__tests__/fixtures/credential-scan/allowlisted-sentinel.json",
    literal: "allura_mcp_testfixture000000000000",
    reason: "Synthetic scanner sentinel proves exact path-and-literal allowlisting.",
  },
];
