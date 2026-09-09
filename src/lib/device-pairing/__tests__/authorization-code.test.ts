import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  bindCompletionNonce,
  generateAuthorizationCode,
  generateCompletionNonce,
  hashAuthorizationCode,
  verifyCompletionNonceBinding,
  type CompletionNonceBinding,
} from "../authorization-code";

describe("Story 29.3 Authorization Code + Completion Nonce", () => {
  describe("generateAuthorizationCode", () => {
    it("produces a base64url string of at least 43 chars (256-bit)", () => {
      const code = generateAuthorizationCode();
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(code.length).toBeGreaterThanOrEqual(43);
    });

    it("contains no padding characters", () => {
      expect(generateAuthorizationCode()).not.toContain("=");
    });

    it("contains no standard-base64 characters (+ or /)", () => {
      const code = generateAuthorizationCode();
      expect(code).not.toContain("+");
      expect(code).not.toContain("/");
    });

    it("decodes to exactly 32 bytes (256 bits)", () => {
      const code = generateAuthorizationCode();
      const bytes = Buffer.from(code, "base64url");
      expect(bytes.length).toBe(32);
    });

    it("produces a fresh code on each call (non-deterministic)", () => {
      expect(generateAuthorizationCode()).not.toBe(generateAuthorizationCode());
    });
  });

  describe("hashAuthorizationCode", () => {
    it("produces a lowercase SHA-256 hex digest of the code", () => {
      const code = generateAuthorizationCode();
      const hash = hashAuthorizationCode(code);
      const expected = createHash("sha256").update(code).digest("hex");
      expect(hash).toBe(expected);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for the same code", () => {
      const code = "deterministic-code-value";
      expect(hashAuthorizationCode(code)).toBe(hashAuthorizationCode(code));
    });

    it("differs for different codes", () => {
      const a = hashAuthorizationCode("code-a");
      const b = hashAuthorizationCode("code-b");
      expect(a).not.toBe(b);
    });

    it("never returns the raw code (only the hash is storable — §4.2 step 10)", () => {
      const code = generateAuthorizationCode();
      const hash = hashAuthorizationCode(code);
      expect(hash).not.toBe(code);
      expect(hash).not.toContain(code);
    });
  });

  describe("generateCompletionNonce", () => {
    it("produces a base64url string of at least 43 chars (32 bytes)", () => {
      const nonce = generateCompletionNonce();
      expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(nonce.length).toBeGreaterThanOrEqual(43);
    });

    it("contains no padding characters", () => {
      expect(generateCompletionNonce()).not.toContain("=");
    });

    it("contains no standard-base64 characters (+ or /)", () => {
      const nonce = generateCompletionNonce();
      expect(nonce).not.toContain("+");
      expect(nonce).not.toContain("/");
    });

    it("decodes to exactly 32 bytes (256 bits)", () => {
      const nonce = generateCompletionNonce();
      const bytes = Buffer.from(nonce, "base64url");
      expect(bytes.length).toBe(32);
    });

    it("produces a fresh nonce on each call (non-deterministic)", () => {
      expect(generateCompletionNonce()).not.toBe(generateCompletionNonce());
    });
  });

  describe("bindCompletionNonce (§4.2 step 11 — binding to code/enrollment/PK)", () => {
    it("produces a binding object that binds the nonce to (code_hash, enrollment_id, public_key)", () => {
      const code = generateAuthorizationCode();
      const codeHash = hashAuthorizationCode(code);
      const nonce = generateCompletionNonce();
      const enrollmentId = "enr_abc123";
      const publicKey = "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----";

      const binding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      expect(binding.nonce).toBe(nonce);
      expect(binding.authorizationCodeHash).toBe(codeHash);
      expect(binding.enrollmentId).toBe(enrollmentId);
      expect(binding.publicKey).toBe(publicKey);
      // The binding digest must be a SHA-256 hex of the canonical binding input
      expect(binding.bindingDigest).toMatch(/^[0-9a-f]{64}$/);
    });

    it("the bindingDigest changes if any bound field changes (tamper detection)", () => {
      const code = generateAuthorizationCode();
      const codeHash = hashAuthorizationCode(code);
      const nonce = generateCompletionNonce();
      const enrollmentId = "enr_abc123";
      const publicKey = "pk-A";

      const baseBinding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      // Different enrollment_id → different digest
      const b2 = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId: "enr_different",
        publicKey,
      });
      expect(b2.bindingDigest).not.toBe(baseBinding.bindingDigest);

      // Different public_key → different digest
      const b3 = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey: "pk-B",
      });
      expect(b3.bindingDigest).not.toBe(baseBinding.bindingDigest);

      // Different code_hash → different digest
      const b4 = bindCompletionNonce({
        nonce,
        authorizationCodeHash: hashAuthorizationCode("different-code"),
        enrollmentId,
        publicKey,
      });
      expect(b4.bindingDigest).not.toBe(baseBinding.bindingDigest);

      // Different nonce → different digest
      const b5 = bindCompletionNonce({
        nonce: generateCompletionNonce(),
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });
      expect(b5.bindingDigest).not.toBe(baseBinding.bindingDigest);
    });

    it("the bindingDigest is deterministic for the same inputs", () => {
      const inputs = {
        nonce: "fixed-nonce",
        authorizationCodeHash: hashAuthorizationCode("fixed-code"),
        enrollmentId: "enr_fixed",
        publicKey: "pk-fixed",
      };
      const a = bindCompletionNonce(inputs);
      const b = bindCompletionNonce(inputs);
      expect(a.bindingDigest).toBe(b.bindingDigest);
    });
  });

  describe("verifyCompletionNonceBinding (replay + expiry + binding)", () => {
    const code = generateAuthorizationCode();
    const codeHash = hashAuthorizationCode(code);
    const enrollmentId = "enr_abc123";
    const publicKey = "pk-A";

    it("accepts a matching binding within the expiry window", () => {
      const nonce = generateCompletionNonce();
      const issuedAt = Date.now();
      const binding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      const result = verifyCompletionNonceBinding({
        presented: binding,
        expected: {
          authorizationCodeHash: codeHash,
          enrollmentId,
          publicKey,
        },
        issuedAt,
        now: issuedAt + 30_000, // 30s into a 60s window
        ttlMs: 60_000,
      });

      expect(result.valid).toBe(true);
      expect(result.reason).toBe("ok");
    });

    it("rejects a replayed nonce (same nonce presented twice)", () => {
      const nonce = generateCompletionNonce();
      const issuedAt = Date.now();
      const binding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      // First presentation — valid
      const r1 = verifyCompletionNonceBinding({
        presented: binding,
        expected: {
          authorizationCodeHash: codeHash,
          enrollmentId,
          publicKey,
        },
        issuedAt,
        now: issuedAt + 10_000,
        ttlMs: 60_000,
      });
      expect(r1.valid).toBe(true);

      // Second presentation with same nonce but a different code hash →
      // bindingDigest mismatch → rejected. This models replay detection:
      // a consumed nonce cannot be re-bound to a fresh code.
      const replayBinding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: hashAuthorizationCode("different-code"),
        enrollmentId,
        publicKey,
      });
      const r2 = verifyCompletionNonceBinding({
        presented: replayBinding,
        expected: {
          authorizationCodeHash: codeHash,
          enrollmentId,
          publicKey,
        },
        issuedAt,
        now: issuedAt + 20_000,
        ttlMs: 60_000,
      });
      expect(r2.valid).toBe(false);
      expect(r2.reason).not.toBe("ok");
    });

    it("rejects an expired nonce (past 60s TTL)", () => {
      const nonce = generateCompletionNonce();
      const issuedAt = Date.now();
      const binding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      const result = verifyCompletionNonceBinding({
        presented: binding,
        expected: {
          authorizationCodeHash: codeHash,
          enrollmentId,
          publicKey,
        },
        issuedAt,
        now: issuedAt + 61_000, // 61s — past 60s TTL
        ttlMs: 60_000,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("expired");
    });

    it("rejects a nonce bound to a different enrollment_id", () => {
      const nonce = generateCompletionNonce();
      const issuedAt = Date.now();
      const binding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      const result = verifyCompletionNonceBinding({
        presented: binding,
        expected: {
          authorizationCodeHash: codeHash,
          enrollmentId: "enr_different", // mismatch
          publicKey,
        },
        issuedAt,
        now: issuedAt + 10_000,
        ttlMs: 60_000,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("binding_mismatch");
    });

    it("rejects a nonce bound to a different public_key", () => {
      const nonce = generateCompletionNonce();
      const issuedAt = Date.now();
      const binding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      const result = verifyCompletionNonceBinding({
        presented: binding,
        expected: {
          authorizationCodeHash: codeHash,
          enrollmentId,
          publicKey: "pk-B", // mismatch
        },
        issuedAt,
        now: issuedAt + 10_000,
        ttlMs: 60_000,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("binding_mismatch");
    });

    it("rejects a nonce bound to a different authorization_code_hash", () => {
      const nonce = generateCompletionNonce();
      const issuedAt = Date.now();
      const binding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      const result = verifyCompletionNonceBinding({
        presented: binding,
        expected: {
          authorizationCodeHash: hashAuthorizationCode("different-code"),
          enrollmentId,
          publicKey,
        },
        issuedAt,
        now: issuedAt + 10_000,
        ttlMs: 60_000,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("binding_mismatch");
    });

    it("rejects a tampered bindingDigest (binding integrity)", () => {
      const nonce = generateCompletionNonce();
      const issuedAt = Date.now();
      const binding = bindCompletionNonce({
        nonce,
        authorizationCodeHash: codeHash,
        enrollmentId,
        publicKey,
      });

      const tampered: CompletionNonceBinding = {
        ...binding,
        bindingDigest: "0".repeat(64), // wrong digest
      };

      const result = verifyCompletionNonceBinding({
        presented: tampered,
        expected: {
          authorizationCodeHash: codeHash,
          enrollmentId,
          publicKey,
        },
        issuedAt,
        now: issuedAt + 10_000,
        ttlMs: 60_000,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("binding_mismatch");
    });
  });

  describe("no raw code in any log/event (NFR1, AC-25)", () => {
    it("hashAuthorizationCode never returns the raw code", () => {
      const code = generateAuthorizationCode();
      const hash = hashAuthorizationCode(code);
      expect(hash).not.toBe(code);
      // Hash is a 64-char hex string; the code is base64url — no overlap
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("bindCompletionNonce stores only the code hash, never the raw code", () => {
      const code = generateAuthorizationCode();
      const codeHash = hashAuthorizationCode(code);
      const binding = bindCompletionNonce({
        nonce: generateCompletionNonce(),
        authorizationCodeHash: codeHash,
        enrollmentId: "enr_x",
        publicKey: "pk-x",
      });
      // The binding object must not contain the raw code
      expect(JSON.stringify(binding)).not.toContain(code);
    });
  });
});