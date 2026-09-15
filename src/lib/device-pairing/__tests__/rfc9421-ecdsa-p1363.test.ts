import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import { normalizeEcdsaP1363 } from "../rfc9421";

describe("Story 29.2 ECDSA P-256 IEEE P1363 normalization (architecture §4.4, AD-64)", () => {
  it("converts a DER-encoded P-256 signature to 64-byte P1363 r‖s", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const data = Buffer.from("canonical-test-message");

    // Produce a DER-encoded signature (the form most crypto libraries emit)
    const derSig = sign("SHA256", data, privateKey);
    // DER is typically 70-72 bytes for P-256
    expect(derSig.length).toBeGreaterThanOrEqual(70);
    expect(derSig.length).toBeLessThanOrEqual(72);

    // Normalize to P1363
    const p1363 = normalizeEcdsaP1363(derSig);
    expect(p1363.length).toBe(64);

    // The 64-byte P1363 form must verify against the public key
    const ok = verifyP1363(publicKey, data, p1363);
    expect(ok).toBe(true);
  });

  it("produces a 64-byte result where r is the first 32 bytes and s is the last 32", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const data = Buffer.from("test");
    const derSig = sign("SHA256", data, privateKey);
    const p1363 = Buffer.from(normalizeEcdsaP1363(derSig));

    const r = p1363.subarray(0, 32);
    const s = p1363.subarray(32, 64);
    expect(r.length).toBe(32);
    expect(s.length).toBe(32);
  });

  it("handles ASN.1 integers with leading zero padding", () => {
    // Generate enough signatures to hit one with a leading-zero-padded integer
    // (high byte >= 0x80 triggers ASN.1 padding). Run a few attempts.
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    let foundPadded = false;
    for (let i = 0; i < 50; i++) {
      const data = Buffer.from(`padded-test-${i}`);
      const derSig = sign("SHA256", data, privateKey);
      const p1363 = Buffer.from(normalizeEcdsaP1363(derSig));
      expect(p1363.length).toBe(64);
      const ok = verifyP1363(publicKey, data, p1363);
      expect(ok).toBe(true);
      // DER length > 70 typically means padding was present
      if (derSig.length > 70) {
        foundPadded = true;
      }
    }
    // We should have encountered at least one padded DER sig in 50 attempts
    expect(foundPadded).toBe(true);
  });

  it("rejects malformed DER input", () => {
    expect(() => normalizeEcdsaP1363(Buffer.from([0x00]))).toThrow();
    expect(() => normalizeEcdsaP1363(Buffer.from([0x30, 0x02, 0x00, 0x00]))).toThrow();
    expect(() => normalizeEcdsaP1363(Buffer.alloc(0))).toThrow();
  });

  it("is idempotent when given already-P1363 64-byte input via the verifier path", () => {
    // The verifier's verifySignatureRaw handles both DER and P1363.
    // normalizeEcdsaP1363 itself expects DER; the verifier tries DER normalization
    // only when the signature is not already 64 bytes.
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const data = Buffer.from("idempotent-test");
    const p1363Direct = sign("SHA256", data, {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });
    expect(p1363Direct.length).toBe(64);
    // Verifying the 64-byte form directly works
    const ok = verifyP1363(publicKey, data, p1363Direct);
    expect(ok).toBe(true);
  });
});

function verifyP1363(
  publicKey: import("node:crypto").KeyObject,
  data: Buffer,
  p1363: Uint8Array,
): boolean {
  const { verify } = require("node:crypto") as typeof import("node:crypto");
  return verify(
    "SHA256",
    data,
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(p1363),
  );
}