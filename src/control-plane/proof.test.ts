/**
 * RuVix ControlPlane - Proof Engine Tests
 * 
 * Tests for proof-of-intent creation and verification.
 * Zero-trust enforcement: every proof must be cryptographically valid.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProof,
  getControlPlaneSecretKey,
  ProofClaims,
  validateControlPlaneSecret,
  verifyProof,
  verifyProofOrThrow,
} from "./proof";

// ─────────────────────────────────────────────────────────────────────────────
// TEST SETUP
// ─────────────────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-secret-key-for-ruvix-controlPlane-proof-engine-32chars";
const VALID_CLAIMS: ProofClaims = {
  group_id: "allura-test-tenant",
  nonce: "0123456789abcdef0123456789abcdef", // 32-char hex nonce
  budget_cost: 100,
  permission_tier: "controlPlane",
  audit_context: { test: true },
};

describe("RuVix ControlPlane - Proof Engine", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.RUVIX_CONTROL_PLANE_SECRET;
    process.env.RUVIX_CONTROL_PLANE_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.RUVIX_CONTROL_PLANE_SECRET = originalSecret;
    } else {
      delete process.env.RUVIX_CONTROL_PLANE_SECRET;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CREATE PROOF TESTS
  // ───────────────────────────────────────────────────────────────────────────

  describe("createProof", () => {
    it("should create valid proof with all required fields", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      expect(proof.intent).toBe("mutate");
      expect(proof.subject).toBe("postgres:events");
      expect(proof.actor).toBe("agent-test-001");
      expect(proof.timestamp).toBeGreaterThan(0);
      expect(proof.signature).toHaveLength(64); // SHA256 hex = 64 chars
      expect(proof.claims.group_id).toBe(VALID_CLAIMS.group_id);
      expect(proof.claims.nonce).toHaveLength(32); // Nonce is 16 bytes = 32 hex chars
      expect(proof.claims.budget_cost).toBe(VALID_CLAIMS.budget_cost);
      expect(proof.claims.permission_tier).toBe(VALID_CLAIMS.permission_tier);
    });

    it("should generate unique signatures for different proofs", () => {
      const proof1 = createProof(
        "mutate",
        "postgres:events",
        "agent-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      const proof2 = createProof(
        "query",
        "postgres:events",
        "agent-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      expect(proof1.signature).not.toBe(proof2.signature);
    });

    it("should generate unique signatures for same proof at different times", async () => {
      const proof1 = createProof(
        "mutate",
        "postgres:events",
        "agent-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      // Wait 1ms to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      
      const proof2 = createProof(
        "mutate",
        "postgres:events",
        "agent-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      // Signatures will be different due to timestamp
      expect(proof1.signature).not.toBe(proof2.signature);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // VERIFY PROOF TESTS
  // ───────────────────────────────────────────────────────────────────────────

  describe("verifyProof", () => {
    it("should verify valid proof", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(true);
      expect(result.claims?.group_id).toBe(VALID_CLAIMS.group_id);
      expect(result.claims?.nonce).toBe(VALID_CLAIMS.nonce);
      expect(result.error).toBeUndefined();
    });

    it("should reject proof with missing intent", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      (proof as any).intent = undefined;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("intent");
    });

    it("should reject proof with missing subject", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      (proof as any).subject = undefined;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("subject");
    });

    it("should reject proof with missing actor", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      (proof as any).actor = undefined;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("actor");
    });

    it("should reject proof with missing timestamp", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      (proof as any).timestamp = undefined;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("timestamp");
    });

    it("should reject proof with missing signature", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      (proof as any).signature = undefined;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("signature");
    });

    it("should reject proof with missing claims", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      (proof as any).claims = undefined;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("claims");
    });

    it("should reject proof with missing nonce in claims", () => {
      // Create valid proof first
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      
      // Then manually remove nonce to simulate tampering
      (proof.claims as any).nonce = undefined;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("nonce");
    });

    it("should reject proof with short nonce", () => {
      // Create valid proof first
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      
      // Then manually set short nonce to simulate tampering
      proof.claims.nonce = "short";

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Nonce too short");
    });

    it("should auto-generate nonce if not provided", () => {
      const claimsWithoutNonce = {
        group_id: "allura-test-tenant",
        budget_cost: 100,
      };
      
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        claimsWithoutNonce as any,
        TEST_SECRET
      );

      expect(proof.claims.nonce).toBeDefined();
      expect(proof.claims.nonce).toHaveLength(32);
      
      // Verify the proof with auto-generated nonce is valid
      const result = verifyProof(proof, TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it("should reject proof with missing group_id in claims", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        { ...VALID_CLAIMS, group_id: undefined as any },
        TEST_SECRET
      );

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("group_id");
    });

    it("should reject proof with invalid group_id format", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        { ...VALID_CLAIMS, group_id: "invalid-Group-ID" },
        TEST_SECRET
      );

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("group_id format");
    });

    it("should accept valid allura-* group_id formats", () => {
      const validFormats = [
        "allura-faith-meats",
        "allura-audits",
        "allura-personal",
        "allura-creative-studio",
        "allura-nonprofit-01",
      ];

      for (const groupId of validFormats) {
        const proof = createProof(
          "mutate",
          "postgres:events",
          "agent-test-001",
          { ...VALID_CLAIMS, group_id: groupId },
          TEST_SECRET
        );

        const result = verifyProof(proof, TEST_SECRET);

        expect(result.valid).toBe(true);
      }
    });

    it("should reject expired proof", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      // Set timestamp to 6 minutes ago (beyond 5-minute validity)
      proof.timestamp = Date.now() - 6 * 60 * 1000;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("should reject proof with future timestamp", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      // Set timestamp to 1 minute in the future (beyond 30s skew)
      proof.timestamp = Date.now() + 60 * 1000;

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("future");
    });

    it("should accept proof with valid clock skew (within 30 seconds)", () => {
      // Create proof with timestamp 20 seconds in the future
      const futureTimestamp = Date.now() + 20 * 1000;
      
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      
      // Recreate proof with future timestamp (so signature matches)
      const proofWithFuture = {
        ...proof,
        timestamp: futureTimestamp,
      };
      
      // Recalculate signature for the future timestamp
      const canonicalString = JSON.stringify({
        intent: proof.intent,
        subject: proof.subject,
        actor: proof.actor,
        timestamp: futureTimestamp,
        claims: proof.claims,
      });
      
      const { createHmac } = require("crypto");
      proofWithFuture.signature = createHmac("sha256", TEST_SECRET)
        .update(canonicalString)
        .digest("hex");

      const result = verifyProof(proofWithFuture, TEST_SECRET);

      expect(result.valid).toBe(true);
    });

    it("should reject proof with tampered signature", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      // Tamper with the signature
      proof.signature = proof.signature.replace(/^./, (c) =>
        c === "a" ? "b" : "a"
      );

      const result = verifyProof(proof, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Signature");
    });

    it("should reject proof verified with wrong secret", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      const result = verifyProof(proof, "wrong-secret-key");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Signature");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // VERIFY PROOF OR THROW TESTS
  // ───────────────────────────────────────────────────────────────────────────

  describe("verifyProofOrThrow", () => {
    it("should return claims for valid proof", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );

      const claims = verifyProofOrThrow(proof, TEST_SECRET);

      expect(claims.group_id).toBe(VALID_CLAIMS.group_id);
      expect(claims.nonce).toBe(VALID_CLAIMS.nonce);
    });

    it("should throw error for invalid proof", () => {
      const proof = createProof(
        "mutate",
        "postgres:events",
        "agent-test-001",
        VALID_CLAIMS,
        TEST_SECRET
      );
      (proof as any).signature = "invalid";

      expect(() => verifyProofOrThrow(proof, TEST_SECRET)).toThrow(
        "Proof verification failed"
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CONTROL_PLANE SECRET KEY TESTS
  // ───────────────────────────────────────────────────────────────────────────

  describe("getControlPlaneSecretKey", () => {
    it("should return secret when configured", () => {
      const secret = getControlPlaneSecretKey();
      expect(secret).toBe(TEST_SECRET);
    });

    it("should throw error when secret is not configured", () => {
      delete process.env.RUVIX_CONTROL_PLANE_SECRET;

      expect(() => getControlPlaneSecretKey()).toThrow(
        "RUVIX_CONTROL_PLANE_SECRET environment variable is required"
      );
    });
  });

  describe("validateControlPlaneSecret", () => {
    it("should return true when secret is configured and valid length", () => {
      process.env.RUVIX_CONTROL_PLANE_SECRET = TEST_SECRET;
      expect(validateControlPlaneSecret()).toBe(true);
    });

    it("should return false when secret is too short", () => {
      process.env.RUVIX_CONTROL_PLANE_SECRET = "short";
      expect(validateControlPlaneSecret()).toBe(false);
    });

    it("should return false when secret is not configured", () => {
      delete process.env.RUVIX_CONTROL_PLANE_SECRET;
      expect(validateControlPlaneSecret()).toBe(false);
    });
  });
});
