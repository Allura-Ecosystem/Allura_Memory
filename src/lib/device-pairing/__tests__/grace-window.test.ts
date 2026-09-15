import { describe, expect, it } from "vitest";

import {
  getDeviceGraceMaxExchanges,
  getDeviceKeyGraceHours,
} from "@/lib/device-pairing/config";

describe("device key grace-window configuration", () => {
  it("defaults key grace hours to 24 and accepts only whole hours from 1 through 72", () => {
    expect(getDeviceKeyGraceHours({ ALLURA_DEVICE_KEY_GRACE_HOURS: undefined })).toBe(24);
    expect(getDeviceKeyGraceHours({ ALLURA_DEVICE_KEY_GRACE_HOURS: "1" })).toBe(1);
    expect(getDeviceKeyGraceHours({ ALLURA_DEVICE_KEY_GRACE_HOURS: "72" })).toBe(72);
    expect(() => getDeviceKeyGraceHours({ ALLURA_DEVICE_KEY_GRACE_HOURS: "0" })).toThrow(/ALLURA_DEVICE_KEY_GRACE_HOURS/);
    expect(() => getDeviceKeyGraceHours({ ALLURA_DEVICE_KEY_GRACE_HOURS: "24.5" })).toThrow(/ALLURA_DEVICE_KEY_GRACE_HOURS/);
    expect(() => getDeviceKeyGraceHours({ ALLURA_DEVICE_KEY_GRACE_HOURS: "73" })).toThrow(/ALLURA_DEVICE_KEY_GRACE_HOURS/);
  });

  it("defaults max exchanges to 5 and accepts only whole counts from 1 through 100", () => {
    expect(getDeviceGraceMaxExchanges({ ALLURA_DEVICE_GRACE_MAX_EXCHANGES: undefined })).toBe(5);
    expect(getDeviceGraceMaxExchanges({ ALLURA_DEVICE_GRACE_MAX_EXCHANGES: "1" })).toBe(1);
    expect(getDeviceGraceMaxExchanges({ ALLURA_DEVICE_GRACE_MAX_EXCHANGES: "100" })).toBe(100);
    expect(() => getDeviceGraceMaxExchanges({ ALLURA_DEVICE_GRACE_MAX_EXCHANGES: "0" })).toThrow(/ALLURA_DEVICE_GRACE_MAX_EXCHANGES/);
    expect(() => getDeviceGraceMaxExchanges({ ALLURA_DEVICE_GRACE_MAX_EXCHANGES: "5.5" })).toThrow(/ALLURA_DEVICE_GRACE_MAX_EXCHANGES/);
    expect(() => getDeviceGraceMaxExchanges({ ALLURA_DEVICE_GRACE_MAX_EXCHANGES: "101" })).toThrow(/ALLURA_DEVICE_GRACE_MAX_EXCHANGES/);
  });
});
