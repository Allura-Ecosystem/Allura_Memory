import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearDevicePairingConfig,
  getDeviceAuthAudience,
  getDeviceAuthOrigin,
} from "../config";

describe("Story 29.2 device-pairing config readers", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    clearDevicePairingConfig();
    delete process.env.ALLURA_DEVICE_AUTH_ORIGIN;
    delete process.env.ALLURA_DEVICE_AUTH_AUDIENCE;
  });

  afterEach(() => {
    clearDevicePairingConfig();
    for (const k of Object.keys(origEnv)) {
      process.env[k] = origEnv[k];
    }
  });

  it("getDeviceAuthOrigin returns ALLURA_DEVICE_AUTH_ORIGIN when set", () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = "https://api.allura.example.com";
    expect(getDeviceAuthOrigin()).toBe("https://api.allura.example.com");
  });

  it("getDeviceAuthOrigin rejects an empty origin", () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = "";
    expect(() => getDeviceAuthOrigin()).toThrow();
  });

  it("getDeviceAuthOrigin rejects a non-URL origin", () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = "not-a-url";
    expect(() => getDeviceAuthOrigin()).toThrow();
  });

  it("getDeviceAuthAudience returns ALLURA_DEVICE_AUTH_AUDIENCE when set", () => {
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE =
      "https://api.allura.example.com/device-auth";
    expect(getDeviceAuthAudience()).toBe(
      "https://api.allura.example.com/device-auth",
    );
  });

  it("getDeviceAuthAudience rejects an empty audience", () => {
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = "";
    expect(() => getDeviceAuthAudience()).toThrow();
  });

  it("getDeviceAuthAudience rejects a non-URL audience", () => {
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = "just-a-string";
    expect(() => getDeviceAuthAudience()).toThrow();
  });

  it("both readers respect overrides passed for test isolation", () => {
    expect(
      getDeviceAuthOrigin({ ALLURA_DEVICE_AUTH_ORIGIN: "https://override.test" }),
    ).toBe("https://override.test");
    expect(
      getDeviceAuthAudience({
        ALLURA_DEVICE_AUTH_AUDIENCE: "https://override.test/device-auth",
      }),
    ).toBe("https://override.test/device-auth");
  });
});