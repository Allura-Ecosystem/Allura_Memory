/**
 * Story 29.2 — Device-pairing environment configuration readers.
 *
 * Reads `ALLURA_DEVICE_AUTH_ORIGIN` and `ALLURA_DEVICE_AUTH_AUDIENCE`
 * (architecture §4.4, AD-64). The verifier reconstructs `@target-uri`
 * from the configured origin, NOT from the untrusted Host header.
 * The audience is the device-auth API audience, NOT the MCP endpoint.
 *
 * Uses Zod validation at the external boundary (project convention).
 */
import { z } from "zod";

const originSchema = z.object({
  ALLURA_DEVICE_AUTH_ORIGIN: z
    .string()
    .min(1, "ALLURA_DEVICE_AUTH_ORIGIN must not be empty")
    .url("ALLURA_DEVICE_AUTH_ORIGIN must be a valid URL"),
});

const audienceSchema = z.object({
  ALLURA_DEVICE_AUTH_AUDIENCE: z
    .string()
    .min(1, "ALLURA_DEVICE_AUTH_AUDIENCE must not be empty")
    .url("ALLURA_DEVICE_AUTH_AUDIENCE must be a valid URL"),
});

const deviceKeyGraceHoursSchema = z
  .string()
  .regex(/^(?:[1-9]|[1-6][0-9]|7[0-2])$/, "ALLURA_DEVICE_KEY_GRACE_HOURS must be an integer from 1 through 72");

const DEFAULT_DEVICE_KEY_GRACE_HOURS = 24;

export type DeviceAuthEnv = {
  ALLURA_DEVICE_AUTH_ORIGIN: string;
  ALLURA_DEVICE_AUTH_AUDIENCE: string;
};

let _cachedOrigin: string | null = null;
let _cachedAudience: string | null = null;

function resolveOrigin(
  overrides?: Partial<Record<string, string | undefined>>,
): string {
  const source = { ...process.env, ...overrides };
  const result = originSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.flatten().fieldErrors;
    throw new Error(
      `Device-auth origin validation failed: ${JSON.stringify(issues)}`,
    );
  }
  return result.data.ALLURA_DEVICE_AUTH_ORIGIN;
}

function resolveAudience(
  overrides?: Partial<Record<string, string | undefined>>,
): string {
  const source = { ...process.env, ...overrides };
  const result = audienceSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.flatten().fieldErrors;
    throw new Error(
      `Device-auth audience validation failed: ${JSON.stringify(issues)}`,
    );
  }
  return result.data.ALLURA_DEVICE_AUTH_AUDIENCE;
}

/**
 * Get the configured device-auth origin (`ALLURA_DEVICE_AUTH_ORIGIN`).
 *
 * Architecture §4.4: `@target-uri` is reconstructed from this origin,
 * not from the untrusted Host header.
 */
export function getDeviceAuthOrigin(
  overrides?: Partial<Record<string, string | undefined>>,
): string {
  if (overrides) {
    return resolveOrigin(overrides);
  }
  if (_cachedOrigin === null) {
    _cachedOrigin = resolveOrigin();
  }
  return _cachedOrigin;
}

/**
 * Get the configured device-auth audience (`ALLURA_DEVICE_AUTH_AUDIENCE`).
 *
 * Architecture §4.4: the audience is the device-auth API audience,
 * not the MCP endpoint.
 */
export function getDeviceAuthAudience(
  overrides?: Partial<Record<string, string | undefined>>,
): string {
  if (overrides) {
    return resolveAudience(overrides);
  }
  if (_cachedAudience === null) {
    _cachedAudience = resolveAudience();
  }
  return _cachedAudience;
}

/**
 * Get the key-rotation grace window in hours. Defaults to 24 and fails closed
 * unless an explicit value is a base-10 integer in the inclusive 1..72 range.
 */
export function getDeviceKeyGraceHours(
  overrides?: Partial<Record<string, string | undefined>>,
): number {
  const raw = overrides?.ALLURA_DEVICE_KEY_GRACE_HOURS ?? process.env.ALLURA_DEVICE_KEY_GRACE_HOURS;
  if (raw === undefined) return DEFAULT_DEVICE_KEY_GRACE_HOURS;
  const parsed = deviceKeyGraceHoursSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("ALLURA_DEVICE_KEY_GRACE_HOURS must be an integer from 1 through 72");
  }
  return Number(parsed.data);
}

/**
 * Enrollment TTL: 10 minutes (architecture §4.1 step 4, AC-07).
 */
const DEFAULT_ENROLLMENT_TTL_MS = 10 * 60 * 1000;

/**
 * Get the enrollment transaction TTL in ms (default 10 minutes).
 *
 * Architecture §4.1 step 4: `expires_at = NOW() + 10 minutes`.
 */
export function getEnrollmentTtlMs(): number {
  const raw = process.env.ALLURA_DEVICE_ENROLLMENT_TTL_MS;
  if (!raw) return DEFAULT_ENROLLMENT_TTL_MS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_ENROLLMENT_TTL_MS;
}

/**
 * Callback type deployment allowlist (architecture §4.1 step 3, AD-63, LOW-F4).
 *
 * `deep_link` and `loopback` are the two supported callback types. A deployment
 * may disable either by setting `ALLURA_DEVICE_PAIRING_CALLBACK_ALLOWLIST` to a
 * comma-separated subset (e.g. `deep_link`). If unset, both are allowed.
 */
export function getPairingCallbackAllowlist(): string[] {
  const raw = process.env.ALLURA_DEVICE_PAIRING_CALLBACK_ALLOWLIST;
  if (!raw || raw.trim() === "") return ["deep_link", "loopback"];
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s === "deep_link" || s === "loopback");
  if (parsed.length === 0) return ["deep_link", "loopback"];
  return parsed;
}

/** Clear the cached config — useful in tests. */
export function clearDevicePairingConfig(): void {
  _cachedOrigin = null;
  _cachedAudience = null;
}