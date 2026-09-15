import { afterEach, describe, expect, it } from "vitest";

import { clearDevicePairingConfig, getDeviceKeyGraceHours } from "../config";

describe("Story 29.13 — rotation activate configuration", () => {
  const originalGraceHours = process.env.ALLURA_DEVICE_KEY_GRACE_HOURS;

  afterEach(() => {
    if (originalGraceHours === undefined) {
      delete process.env.ALLURA_DEVICE_KEY_GRACE_HOURS;
    } else {
      process.env.ALLURA_DEVICE_KEY_GRACE_HOURS = originalGraceHours;
    }
    clearDevicePairingConfig();
  });

  it("uses a default of 24 hours and rejects non-integer or out-of-range values", () => {
    delete process.env.ALLURA_DEVICE_KEY_GRACE_HOURS;
    expect(getDeviceKeyGraceHours()).toBe(24);

    process.env.ALLURA_DEVICE_KEY_GRACE_HOURS = "1";
    expect(getDeviceKeyGraceHours()).toBe(1);
    process.env.ALLURA_DEVICE_KEY_GRACE_HOURS = "72";
    expect(getDeviceKeyGraceHours()).toBe(72);

    process.env.ALLURA_DEVICE_KEY_GRACE_HOURS = "24.5";
    expect(() => getDeviceKeyGraceHours()).toThrow("ALLURA_DEVICE_KEY_GRACE_HOURS");

    process.env.ALLURA_DEVICE_KEY_GRACE_HOURS = "73";
    expect(() => getDeviceKeyGraceHours()).toThrow("ALLURA_DEVICE_KEY_GRACE_HOURS");
  });
});
