/**
 * Dev auth must never be active in production.
 *
 * Regression guard. The original condition was:
 *   ALLURA_DEV_AUTH_ENABLED && (!isClerkEnabled(c) || c.NODE_ENV !== "production")
 * The `||` made "Clerk not configured" sufficient on its own, so a production
 * deployment with no Clerk keys and ALLURA_DEV_AUTH_ENABLED=true produced an
 * authenticated principal carrying ALLURA_DEV_AUTH_ROLE (default "admin"),
 * bypassing the principal model entirely.
 *
 * These assert behaviour, not source text: they exercise isDevAuthActive and
 * getDevAuthConfig with constructed configs so a refactor that preserves the
 * contract keeps passing, and one that reopens the bypass fails.
 */

import { describe, expect, it } from "vitest";
import { authEnvSchema, getDevAuthConfig, isDevAuthActive, type AuthEnvConfig } from "../config";

type Env = "development" | "production" | "test";

function config(overrides: {
  nodeEnv: Env;
  devAuthEnabled: boolean;
  clerk?: boolean;
}): AuthEnvConfig {
  return authEnvSchema.parse({
    NODE_ENV: overrides.nodeEnv,
    ALLURA_DEV_AUTH_ENABLED: overrides.devAuthEnabled ? "true" : "false",
    ALLURA_DEV_AUTH_ROLE: "admin",
    ...(overrides.clerk
      ? {
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
          CLERK_SECRET_KEY: "sk_test_placeholder",
        }
      : {}),
  });
}

describe("isDevAuthActive — production is absolute", () => {
  it("is false in production when Clerk is absent and dev auth is explicitly enabled", () => {
    // The exact deployed state that motivated this guard.
    expect(isDevAuthActive(config({ nodeEnv: "production", devAuthEnabled: true }))).toBe(false);
  });

  it("is false in production even when Clerk is configured", () => {
    expect(
      isDevAuthActive(config({ nodeEnv: "production", devAuthEnabled: true, clerk: true }))
    ).toBe(false);
  });

  it("does not expose an admin principal in production", () => {
    const devAuth = getDevAuthConfig(config({ nodeEnv: "production", devAuthEnabled: true }));
    expect(devAuth.enabled).toBe(false);
    // Role remains configured, but must be unreachable while disabled.
    expect(devAuth.defaultRole).toBe("admin");
  });
});

describe("isDevAuthActive — non-production behaviour is preserved", () => {
  it("is true in development when enabled and Clerk is absent", () => {
    expect(isDevAuthActive(config({ nodeEnv: "development", devAuthEnabled: true }))).toBe(true);
  });

  it("is true in test when enabled and Clerk is absent", () => {
    expect(isDevAuthActive(config({ nodeEnv: "test", devAuthEnabled: true }))).toBe(true);
  });

  it("is false in development when Clerk is configured — real auth wins", () => {
    expect(
      isDevAuthActive(config({ nodeEnv: "development", devAuthEnabled: true, clerk: true }))
    ).toBe(false);
  });

  it("is false in development when not enabled", () => {
    expect(isDevAuthActive(config({ nodeEnv: "development", devAuthEnabled: false }))).toBe(false);
  });
});
