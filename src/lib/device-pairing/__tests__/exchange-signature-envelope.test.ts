import { describe, expect, it } from "vitest";
import { isValidExchangeSignatureEnvelope } from "@/lib/device-pairing/exchange-service";

const required = ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"];

describe("Story 29.9 — exchange RFC 9421 envelope", () => {
  it("rejects a signature missing a canonical covered component", () => {
    expect(isValidExchangeSignatureEnvelope({ coveredComponents: required.slice(0, -1), created: 100, expires: 200 } as never, 150)).toBe(false);
  });

  it("rejects an exchange envelope with extra or duplicate covered components", () => {
    expect(isValidExchangeSignatureEnvelope({ coveredComponents: [...required, "x-allura-device-id"], created: 100, expires: 200 } as never, 150)).toBe(false);
    expect(isValidExchangeSignatureEnvelope({ coveredComponents: [...required, "@method"], created: 100, expires: 200 } as never, 150)).toBe(false);
  });

  it("rejects an expired signature even when components are complete", () => {
    expect(isValidExchangeSignatureEnvelope({ coveredComponents: required, created: 100, expires: 150 } as never, 150)).toBe(false);
  });
});
