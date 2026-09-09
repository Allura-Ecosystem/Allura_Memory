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

/** Clear the cached config — useful in tests. */
export function clearDevicePairingConfig(): void {
  _cachedOrigin = null;
  _cachedAudience = null;
}