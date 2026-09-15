import { describe, expect, it } from "vitest";

import {
  B1_NOT_PROCURED,
  createPlaywrightCapability,
  describeClerkPairingE2eReadiness,
  inspectClerkPairingE2eReadiness,
} from "./clerk-test-harness";

describe("Story 29.20 — Clerk test harness readiness", () => {
  it("reports B1_NOT_PROCURED when all runtime inputs are absent", () => {
    const readiness = inspectClerkPairingE2eReadiness({});

    expect(readiness).toEqual({
      ready: false,
      code: B1_NOT_PROCURED,
      reason: "B1_NOT_PROCURED: missing ALLURA_CLERK_TEST_INSTANCE_URL, ALLURA_CLERK_TEST_TOKEN, ALLURA_E2E_BASE_URL, ALLURA_E2E_PAIRING_BROWSER_URL, ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID, ALLURA_E2E_DEVICE_AUTH_ORIGIN, ALLURA_E2E_DEVICE_AUTH_AUDIENCE",
    });
  });

  it("redacts the Clerk test token from a readiness summary", () => {
    const token = "clerk_test_secret_that_must_not_appear";
    const readiness = inspectClerkPairingE2eReadiness({
      ALLURA_CLERK_TEST_INSTANCE_URL: "https://clerk.test.example",
      ALLURA_CLERK_TEST_TOKEN: token,
      ALLURA_E2E_BASE_URL: "https://allura.test.example",
      ALLURA_E2E_PAIRING_BROWSER_URL: "https://allura.test.example/device-pairing",
      ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID: "user_test_123",
      ALLURA_E2E_DEVICE_AUTH_ORIGIN: "https://allura.test.example",
      ALLURA_E2E_DEVICE_AUTH_AUDIENCE: "https://api.allura.test.example/device-auth",
    });

    const summary = describeClerkPairingE2eReadiness(readiness);

    expect(summary).toBe("B1_READY: Clerk test instance and pairing browser surface configured");
    expect(summary).not.toContain(token);
  });

  it("supports a local test-only approval mode without Clerk secrets", () => {
    const readiness = inspectClerkPairingE2eReadiness({
      ALLURA_E2E_APPROVAL_MODE: "test_only",
      ALLURA_E2E_BASE_URL: "http://127.0.0.1:3310",
      ALLURA_E2E_DEVICE_AUTH_ORIGIN: "http://127.0.0.1:3310",
      ALLURA_E2E_DEVICE_AUTH_AUDIENCE: "http://127.0.0.1:3310/device-auth",
    });

    expect(readiness).toMatchObject({
      ready: true,
      config: {
        approvalMode: "test_only",
        e2eBaseUrl: "http://127.0.0.1:3310",
        pairingBrowserUrl: "http://127.0.0.1:3310/pair",
      },
    });
    expect(describeClerkPairingE2eReadiness(readiness)).toBe(
      "B1_READY: local test-only pairing browser surface configured",
    );
  });

  it("exposes Playwright only after B1 readiness succeeds", () => {
    const unavailable = inspectClerkPairingE2eReadiness({});
    expect(createPlaywrightCapability(unavailable)).toBeNull();

    const ready = inspectClerkPairingE2eReadiness({
      ALLURA_CLERK_TEST_INSTANCE_URL: "https://clerk.test.example",
      ALLURA_CLERK_TEST_TOKEN: "clerk_test_secret",
      ALLURA_E2E_BASE_URL: "https://allura.test.example",
      ALLURA_E2E_PAIRING_BROWSER_URL: "https://allura.test.example/device-pairing",
      ALLURA_E2E_EXPECTED_HUMAN_PRINCIPAL_ID: "user_test_123",
      ALLURA_E2E_DEVICE_AUTH_ORIGIN: "https://allura.test.example",
      ALLURA_E2E_DEVICE_AUTH_AUDIENCE: "https://api.allura.test.example/device-auth",
    });

    expect(createPlaywrightCapability(ready)).toMatchObject({
      open: expect.any(Function),
    });
  });
});
