/**
 * Dev auth must never be active in production.
 *
 * Regression guard. The original condition was:
 *   NODE_ENV !== "production" && ALLURA_DEV_AUTH_ENABLED
 * The `||` made "provider not configured" sufficient on its own, so a
 * production deployment with no provider and ALLURA_DEV_AUTH_ENABLED=true
 * produced an authenticated principal carrying ALLURA_DEV_AUTH_ROLE
 * (default "admin"), bypassing the principal model entirely.
 *
 * These assert behaviour, not source text: they exercise isDevAuthActive and
 * getDevAuthConfig with constructed configs so a refactor that preserves the
 * contract keeps passing, and one that reopens the bypass fails.
 */

import { describe, expect, it } from "vitest";
import { type AuthEnvConfig, authEnvSchema, getDevAuthConfig, isDevAuthActive } from "../config";

type Env = "development" | "production" | "test";

function config(overrides: {
  nodeEnv: Env;
  devAuthEnabled: boolean;
}): AuthEnvConfig {
  return authEnvSchema.parse({
    NODE_ENV: overrides.nodeEnv,
    ALLURA_DEV_AUTH_ENABLED: overrides.devAuthEnabled ? "true" : "false",
    ALLURA_DEV_AUTH_ROLE: "admin",
  });
}

describe("isDevAuthActive — production is absolute", () => {
  it("is false in production when dev auth is explicitly enabled and no provider is configured", () => {
    // The exact deployed state that motivated this guard.
    expect(isDevAuthActive(config({ nodeEnv: "production", devAuthEnabled: true }))).toBe(false);
  });

  it("is false in production with Cloudflare Access enabled and dev auth explicitly enabled", () => {
    const previous = process.env.ALLURA_CF_ACCESS_ENABLED;
    process.env.ALLURA_CF_ACCESS_ENABLED = "true";
    try {
      expect(isDevAuthActive(config({ nodeEnv: "production", devAuthEnabled: true }))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.ALLURA_CF_ACCESS_ENABLED;
      else process.env.ALLURA_CF_ACCESS_ENABLED = previous;
    }
  });

  it("does not expose an admin principal in production", () => {
    const devAuth = getDevAuthConfig(config({ nodeEnv: "production", devAuthEnabled: true }));
    expect(devAuth.enabled).toBe(false);
    // Role remains configured, but must be unreachable while disabled.
    expect(devAuth.defaultRole).toBe("admin");
  });
});

describe("isDevAuthActive — non-production behaviour is preserved", () => {
  it("is true in development when enabled", () => {
    expect(isDevAuthActive(config({ nodeEnv: "development", devAuthEnabled: true }))).toBe(true);
  });

  it("is true in test when enabled", () => {
    expect(isDevAuthActive(config({ nodeEnv: "test", devAuthEnabled: true }))).toBe(true);
  });

  it("is false in development when not enabled", () => {
    expect(isDevAuthActive(config({ nodeEnv: "development", devAuthEnabled: false }))).toBe(false);
  });
});