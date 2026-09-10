import { afterEach, describe, expect, it } from "vitest";
import { getDeviceGraceMaxExchanges } from "../config";

describe("Story 29.14 grace recovery configuration", () => {
  const original = process.env.ALLURA_DEVICE_GRACE_MAX_EXCHANGES;

  afterEach(() => {
    if (original === undefined) delete process.env.ALLURA_DEVICE_GRACE_MAX_EXCHANGES;
    else process.env.ALLURA_DEVICE_GRACE_MAX_EXCHANGES = original;
  });

  it("defaults to five and accepts only a bounded positive integer", () => {
    delete process.env.ALLURA_DEVICE_GRACE_MAX_EXCHANGES;
    expect(getDeviceGraceMaxExchanges()).toBe(5);
    process.env.ALLURA_DEVICE_GRACE_MAX_EXCHANGES = "100";
    expect(getDeviceGraceMaxExchanges()).toBe(100);
    for (const value of ["0", "-1", "01", "101", "five"]) {
      process.env.ALLURA_DEVICE_GRACE_MAX_EXCHANGES = value;
      expect(() => getDeviceGraceMaxExchanges()).toThrow("ALLURA_DEVICE_GRACE_MAX_EXCHANGES");
    }
  });
});
