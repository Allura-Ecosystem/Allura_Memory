import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  computePkceCodeChallengeS256,
  generatePkceVerifier,
  verifyPkceS256,
} from "../pkce";

describe("Story 29.3 PKCE S256 (RFC 7636)", () => {
  describe("generatePkceVerifier", () => {
    it("produces a base64url string of at least 43 chars (>= 256-bit entropy)", () => {
      const verifier = generatePkceVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(verifier.length).toBeGreaterThanOrEqual(43);
    });

    it("contains no padding characters", () => {
      const verifier = generatePkceVerifier();
      expect(verifier).not.toContain("=");
    });

    it("contains no standard-base64 characters (+ or /)", () => {
      const verifier = generatePkceVerifier();
      expect(verifier).not.toContain("+");
      expect(verifier).not.toContain("/");
    });

    it("produces a fresh verifier on each call (non-deterministic)", () => {
      const a = generatePkceVerifier();
      const b = generatePkceVerifier();
      expect(a).not.toBe(b);
    });

    it("decodes to at least 32 bytes (256 bits) of entropy", () => {
      const verifier = generatePkceVerifier();
      const bytes = Buffer.from(verifier, "base64url");
      expect(bytes.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe("computePkceCodeChallengeS256", () => {
    it("produces base64url(SHA-256(verifier)) without padding (RFC 7636)", () => {
      const verifier = generatePkceVerifier();
      const challenge = computePkceCodeChallengeS256(verifier);

      // RFC 7636: challenge = base64url(SHA256(verifier)) with padding stripped
      const expected = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      expect(challenge).toBe(expected);
    });

    it("contains no padding characters", () => {
      const verifier = "test-verifier-value-1234567890";
      const challenge = computePkceCodeChallengeS256(verifier);
      expect(challenge).not.toContain("=");
    });

    it("contains no standard-base64 characters (+ or /)", () => {
      const verifier = "test-verifier-value-1234567890";
      const challenge = computePkceCodeChallengeS256(verifier);
      expect(challenge).not.toContain("+");
      expect(challenge).not.toContain("/");
    });

    it("is deterministic for the same verifier", () => {
      const verifier = "deterministic-verifier-input";
      expect(computePkceCodeChallengeS256(verifier)).toBe(
        computePkceCodeChallengeS256(verifier),
      );
    });

    it("produces a 43-char challenge (SHA-256 = 32 bytes → 43 base64url chars)", () => {
      const verifier = "some-verifier";
      const challenge = computePkceCodeChallengeS256(verifier);
      expect(challenge.length).toBe(43);
    });

    it("matches the RFC 7636 §B. worked example vector", () => {
      // RFC 7636 Appendix B worked example vector
      const verifier =
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
      expect(computePkceCodeChallengeS256(verifier)).toBe(expectedChallenge);
    });
  });

  describe("verifyPkceS256", () => {
    it("returns true when the verifier matches the stored challenge", () => {
      const verifier = generatePkceVerifier();
      const challenge = computePkceCodeChallengeS256(verifier);
      expect(verifyPkceS256(verifier, challenge)).toBe(true);
    });

    it("returns false when the verifier does not match the stored challenge", () => {
      const verifier = generatePkceVerifier();
      const wrongChallenge = computePkceCodeChallengeS256(
        "completely-different-verifier",
      );
      expect(verifyPkceS256(verifier, wrongChallenge)).toBe(false);
    });

    it("returns false for an empty verifier", () => {
      const challenge = computePkceCodeChallengeS256("real-verifier");
      expect(verifyPkceS256("", challenge)).toBe(false);
    });

    it("returns false for an empty stored challenge", () => {
      expect(verifyPkceS256("some-verifier", "")).toBe(false);
    });

    it("returns false for a malformed stored challenge", () => {
      expect(verifyPkceS256("some-verifier", "not-a-real-challenge")).toBe(
        false,
      );
    });

    it("uses constant-time comparison (does not throw on length mismatch)", () => {
      const verifier = generatePkceVerifier();
      const challenge = computePkceCodeChallengeS256(verifier);
      // Short challenge should not throw and should return false
      expect(verifyPkceS256(verifier, "short")).toBe(false);
      // Round-trip still works
      expect(verifyPkceS256(verifier, challenge)).toBe(true);
    });
  });

  describe("verifier-never-in-URL invariant (AD-65, §8.2)", () => {
    it("the verifier is never serialized by the utility functions", () => {
      // The utility functions only return:
      //   generatePkceVerifier() → raw verifier (caller holds in bridge memory)
      //   computePkceCodeChallengeS256(verifier) → challenge (safe for URL)
      //   verifyPkceS256(verifier, storedChallenge) → boolean
      // None of these serialize the verifier into a URL, log, or persistent store.
      // The challenge is derived and is safe to send in a URL.
      const verifier = generatePkceVerifier();
      const challenge = computePkceCodeChallengeS256(verifier);

      // The challenge must NOT equal the verifier (it is a hash)
      expect(challenge).not.toBe(verifier);

      // The challenge must NOT contain the verifier
      expect(challenge).not.toContain(verifier);

      // verifyPkceS256 returns a boolean, not a serialized verifier
      const result = verifyPkceS256(verifier, challenge);
      expect(typeof result).toBe("boolean");
    });
  });
});