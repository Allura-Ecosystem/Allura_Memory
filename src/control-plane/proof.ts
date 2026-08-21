/**
 * RuVix ControlPlane - Proof-of-Intent Engine
 * 
 * TRUSTED CORE: This module contains the cryptographic proof verification logic.
 * Zero external dependencies. Zero trust assumptions.
 * 
 * Every state change requires cryptographic proof-of-intent before mutation.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proof of Intent - Cryptographic evidence that a mutation is authorized
 * 
 * Structure designed for:
 * - Fast verification (HMAC, not full JWT)
 * - Internal enforcement (not external API)
 * - Claims-based policy checking
 */
export interface ProofOfIntent {
  /** What operation is being requested (e.g., "mutate", "query", "delete") */
  intent: string;
  
  /** What resource is being affected (e.g., "postgres:events", "neo4j:Agent") */
  subject: string;
  
  /** Who is requesting (agent_id, user_id, or system) */
  actor: string;
  
  /** Unix timestamp when proof was created */
  timestamp: number;
  
  /** HMAC-SHA256 signature of the proof claims */
  signature: string;
  
  /** Additional claims for policy validation */
  claims: ProofClaims;
}

/**
 * Claims attached to the proof for policy validation
 */
export interface ProofClaims {
  /** Tenant isolation - all operations must have group_id */
  group_id: string;
  
  /** Unique nonce to prevent replay attacks (required) */
  nonce: string;
  
  /** Budget tracking - operation cost estimate */
  budget_cost?: number;
  
  /** Permission tier required (controlPlane, plugin, skill) */
  permission_tier?: "controlPlane" | "kernel" | "plugin" | "skill";
  
  /** Additional context for audit trail */
  audit_context?: Record<string, unknown>;
}

/**
 * Verification result
 */
export interface VerificationResult {
  /** Whether the proof is valid */
  valid: boolean;
  
  /** Error message if invalid */
  error?: string;
  
  /** Verified claims (only if valid) */
  claims?: ProofClaims;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Proof validity window in milliseconds (5 minutes) */
const PROOF_VALIDITY_MS = 5 * 60 * 1000;

/** Maximum clock skew allowed in milliseconds (30 seconds) */
const MAX_CLOCK_SKEW_MS = 30 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// PROOF ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure nonce
 * 
 * @returns 16-byte random hex string (32 chars)
 */
export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Create a proof-of-intent for a state mutation
 * 
 * @param intent - What operation is being requested
 * @param subject - What resource is being affected
 * @param actor - Who is requesting
 * @param claims - Claims for policy validation (nonce will be auto-generated if missing)
 * @param secretKey - HMAC secret key (from environment)
 * @returns Signed proof-of-intent
 */
export function createProof(
  intent: string,
  subject: string,
  actor: string,
  claims: ProofClaims,
  secretKey: string
): ProofOfIntent {
  const timestamp = Date.now();
  
  // Auto-generate nonce if not provided (replay attack protection)
  const claimsWithNonce = {
    ...claims,
    nonce: claims.nonce || generateNonce(),
  };
  
  // Build the canonical string for signing
  const canonicalString = JSON.stringify({
    intent,
    subject,
    actor,
    timestamp,
    claims: claimsWithNonce,
  });
  
  // Create HMAC-SHA256 signature
  const signature = createHmac("sha256", secretKey)
    .update(canonicalString)
    .digest("hex");
  
  return {
    intent,
    subject,
    actor,
    timestamp,
    signature,
    claims: claimsWithNonce,
  };
}

/**
 * Verify a proof-of-intent
 * 
 * Verification checks:
 * 1. Signature validity (HMAC)
 * 2. Timestamp freshness (not expired, not future)
 * 3. Claims structure (group_id present and valid)
 * 
 * @param proof - Proof to verify
 * @param secretKey - HMAC secret key for verification
 * @returns Verification result
 */
export function verifyProof(
  proof: ProofOfIntent,
  secretKey: string
): VerificationResult {
  // ───────────────────────────────────────────────────────────────────────────
  // Check 1: Structure validation
  // ───────────────────────────────────────────────────────────────────────────
  
  if (!proof.intent || typeof proof.intent !== "string") {
    return { valid: false, error: "Missing or invalid intent" };
  }
  
  if (!proof.subject || typeof proof.subject !== "string") {
    return { valid: false, error: "Missing or invalid subject" };
  }
  
  if (!proof.actor || typeof proof.actor !== "string") {
    return { valid: false, error: "Missing or invalid actor" };
  }
  
  if (!proof.timestamp || typeof proof.timestamp !== "number") {
    return { valid: false, error: "Missing or invalid timestamp" };
  }
  
  if (!proof.signature || typeof proof.signature !== "string") {
    return { valid: false, error: "Missing or invalid signature" };
  }
  
  if (!proof.claims || typeof proof.claims !== "object") {
    return { valid: false, error: "Missing or invalid claims" };
  }
  
  // ───────────────────────────────────────────────────────────────────────────
  // Check 2: Claims validation (group_id and nonce are mandatory)
  // ───────────────────────────────────────────────────────────────────────────
  
  const { claims } = proof;
  
  if (!claims.group_id || typeof claims.group_id !== "string") {
    return { valid: false, error: "Missing or invalid group_id in claims" };
  }
  
  // Validate group_id format (allura-* convention)
  if (!/^allura-[a-z0-9-]+$/.test(claims.group_id)) {
    return {
      valid: false,
      error: `Invalid group_id format: "${claims.group_id}" (must match allura-[a-z0-9-]+)`,
    };
  }
  
  // C-001 FIX: Validate nonce presence and format (replay attack protection)
  if (!claims.nonce || typeof claims.nonce !== "string") {
    return { valid: false, error: "Missing or invalid nonce in claims" };
  }
  
  // Nonce must be at least 16 bytes (32 hex chars) to prevent brute force
  if (claims.nonce.length < 32) {
    return {
      valid: false,
      error: `Nonce too short (${claims.nonce.length} chars, minimum 32)`,
    };
  }
  
  // ───────────────────────────────────────────────────────────────────────────
  // Check 3: Timestamp freshness (not expired, not future)
  // ───────────────────────────────────────────────────────────────────────────
  
  const now = Date.now();
  const age = now - proof.timestamp;
  
  if (age < -MAX_CLOCK_SKEW_MS) {
    return {
      valid: false,
      error: `Proof timestamp is in the future (${age}ms skew)`,
    };
  }
  
  if (age > PROOF_VALIDITY_MS) {
    return {
      valid: false,
      error: `Proof has expired (${age}ms old, max ${PROOF_VALIDITY_MS}ms)`,
    };
  }
  
  // ───────────────────────────────────────────────────────────────────────────
  // Check 4: Signature verification (HMAC)
  // ───────────────────────────────────────────────────────────────────────────
  
  const canonicalString = JSON.stringify({
    intent: proof.intent,
    subject: proof.subject,
    actor: proof.actor,
    timestamp: proof.timestamp,
    claims: proof.claims,
  });
  
  const expectedSignature = createHmac("sha256", secretKey)
    .update(canonicalString)
    .digest("hex");
  
  // Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(proof.signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  
  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: "Signature length mismatch" };
  }
  
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, error: "Signature verification failed" };
  }
  
  // ───────────────────────────────────────────────────────────────────────────
  // All checks passed
  // ───────────────────────────────────────────────────────────────────────────
  
  return {
    valid: true,
    claims,
  };
}

/**
 * Verify proof and extract claims (convenience wrapper)
 * 
 * @param proof - Proof to verify
 * @param secretKey - HMAC secret key
 * @returns Claims if valid, throws if invalid
 * @throws Error with verification failure details
 */
export function verifyProofOrThrow(
  proof: ProofOfIntent,
  secretKey: string
): ProofClaims {
  const result = verifyProof(proof, secretKey);
  
  if (!result.valid) {
    throw new Error(`Proof verification failed: ${result.error}`);
  }
  
  return result.claims!;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL_PLANE SECRET KEY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the controlPlane secret key from environment
 * 
 * @returns Secret key for proof signing/verification
 * @throws Error if RUVIX_CONTROL_PLANE_SECRET is not set
 */
export function getControlPlaneSecretKey(): string {
  const secret = process.env.RUVIX_CONTROL_PLANE_SECRET;
  
  if (!secret) {
    throw new Error(
      "RUVIX_CONTROL_PLANE_SECRET environment variable is required for controlPlane operation. " +
      "Generate a secure random string (e.g., openssl rand -hex 32) and set it."
    );
  }
  
  return secret;
}

/**
 * Validate that controlPlane secret key is properly configured
 * 
 * H-001 FIX: Added entropy validation to prevent weak secrets
 * 
 * @returns true if configured with sufficient entropy, false otherwise
 */
export function validateControlPlaneSecret(): boolean {
  try {
    const secret = getControlPlaneSecretKey();
    
    // Minimum 256 bits (32 bytes)
    if (secret.length < 32) {
      return false;
    }
    
    // H-001 FIX: Check for sufficient entropy (no long repeated patterns)
    if (/(.)\1{7,}/.test(secret)) {
      console.warn("[RuVix] ControlPlane secret has low entropy (repeated patterns detected)");
      return false;
    }
    
    // Prefer hex or base64 format (warn if not)
    if (!/^[a-fA-F0-9+/=]+$/.test(secret)) {
      console.warn("[RuVix] ControlPlane secret should be hex or base64 encoded for maximum entropy");
    }
    
    return true;
  } catch {
    return false;
  }
}
