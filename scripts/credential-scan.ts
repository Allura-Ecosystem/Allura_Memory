import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CREDENTIAL_SCAN_ALLOWLIST,
  type CredentialScanAllowlistEntry,
  DEVICE_PAIRING_STATIC_ARTIFACTS,
} from "./credential-scan-policy";

export type CredentialScanSource = Readonly<{ path: string; text: string }>;
export type CredentialScanFinding = Readonly<{ path: string; pointer: string; rule: string }>;
type CandidateFinding = CredentialScanFinding & { candidate: string };

const TEST_PATH_PREFIX = "src/lib/device-pairing/__tests__/";
const WILDCARD = /[*?[\]{}]/;
const VALUE_RULES = [
  ["private-key-header", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/gi],
  ["allura-mcp-token", /\ballura_mcp_[A-Za-z0-9_-]+\b/g],
  ["clerk-key", /\b(?:sk|pk)_[A-Za-z0-9_-]+\b/g],
] as const;
const KEY_RULES = [
  ["pkce-verifier-key", /(?:^|_)(?:pkce_)?(?:code_)?verifier(?:$|_)/i],
  ["completion-or-challenge-nonce-key", /(?:completion|challenge)_nonce/i],
  ["rotation-or-recovery-secret-key", /(?:rotation|recovery).*secret|secret.*(?:rotation|recovery)/i],
  ["raw-challenge-key", /raw_(?:challenge|nonce|proof)/i],
  ["secret-metadata-key", /(?:private.?key|(?:mcp|access|bearer|clerk)?_?token|secret|credential|api_?key|access_?key|password)/i],
] as const;

function validateAllowlist(entries: readonly CredentialScanAllowlistEntry[], sources: readonly CredentialScanSource[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (WILDCARD.test(entry.path)) throw new Error(`Credential scan allowlist wildcard is forbidden: ${entry.path}`);
    if (!entry.path.startsWith(TEST_PATH_PREFIX)) throw new Error(`Credential scan allowlist must use a test path: ${entry.path}`);
    if (!entry.literal || !entry.reason.trim()) throw new Error(`Credential scan allowlist entry requires an exact literal and reason: ${entry.path}`);
    const key = `${entry.path}\u0000${entry.literal}`;
    if (seen.has(key)) throw new Error(`Credential scan allowlist duplicate entry: ${entry.path}`);
    seen.add(key);
    if (!sources.some((source) => source.path === entry.path && source.text.includes(entry.literal))) {
      throw new Error(`Credential scan allowlist entry is unused: ${entry.path}`);
    }
  }
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isAllowed(
  finding: CandidateFinding,
  entries: readonly CredentialScanAllowlistEntry[],
): boolean {
  return entries.some((entry) => entry.path === finding.path && entry.literal === finding.candidate);
}

function scanString(pathname: string, pointer: string, text: string): CandidateFinding[] {
  const valueFindings = VALUE_RULES.flatMap(([rule, pattern]) => {
    const matches = text.matchAll(pattern);
    return Array.from(matches, (match) => ({ path: pathname, pointer, rule, candidate: match[0] }));
  });
  const keyValue = text.match(/(?:private.?key|(?:mcp|access|bearer|clerk)?_?token|secret|credential|api_?key|access_?key|password)(?=\s*[:=])/i);
  return keyValue
    ? [...valueFindings, { path: pathname, pointer, rule: "secret-metadata-key", candidate: keyValue[0] }]
    : valueFindings;
}

function scanJsonValue(pathname: string, value: unknown, pointer = "$"): CandidateFinding[] {
  if (typeof value === "string") return scanString(pathname, pointer, value);
  if (Array.isArray(value)) return value.flatMap((item, index) => scanJsonValue(pathname, item, `${pointer}[${index}]`));
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, nested]) => {
    const keyFindings = KEY_RULES.flatMap(([rule, pattern]) => pattern.test(key)
      ? [{ path: pathname, pointer: `${pointer}.${key}`, rule, candidate: key }]
      : []);
    return [...keyFindings, ...scanJsonValue(pathname, nested, `${pointer}.${key}`)];
  });
}

/**
 * Scan explicit sources and fail closed when the policy itself is ambiguous.
 * Findings never return matched values, so diagnostic output cannot leak them.
 */
export function scanCredentialSources(
  sources: readonly CredentialScanSource[],
  allowlist: readonly CredentialScanAllowlistEntry[] = [],
): CredentialScanFinding[] {
  validateAllowlist(allowlist, sources);
  return sources.flatMap((source) => {
    const json = parseJson(source.text);
    const findings = json === undefined
      ? scanString(source.path, "$", source.text)
      : scanJsonValue(source.path, json);
    return findings
      .filter((finding) => !isAllowed(finding, allowlist))
      .map(({ candidate: _candidate, ...finding }) => finding);
  });
}

/** Scan only persisted device lifecycle metadata records supplied by a live DB query. */
export function scanDeviceEventMetadata(
  events: readonly Readonly<{ event_type: string; metadata: unknown }>[],
): CredentialScanFinding[] {
  return scanCredentialSources(events
    .filter((event) => event.event_type.startsWith("DEVICE_"))
    .map((event) => ({ path: `events/${event.event_type}`, text: JSON.stringify(event.metadata) })));
}

/** Scan the fixed device-pairing fixture/error/log artifact inventory. */
export function scanStaticCredentialArtifacts(repoRoot: string): CredentialScanFinding[] {
  const sources = DEVICE_PAIRING_STATIC_ARTIFACTS.map((relativePath) => ({
    path: relativePath,
    text: readFileSync(path.join(repoRoot, relativePath), "utf8"),
  }));
  return scanCredentialSources(sources, CREDENTIAL_SCAN_ALLOWLIST);
}

function run(): void {
  const findings = scanStaticCredentialArtifacts(process.cwd());
  if (findings.length === 0) {
    console.log("credential-scan: OK (device-pairing static artifacts)");
    return;
  }
  for (const finding of findings) console.error(`${finding.path}:${finding.pointer} ${finding.rule}`);
  process.exitCode = 1;
}

if (import.meta.main) run();
