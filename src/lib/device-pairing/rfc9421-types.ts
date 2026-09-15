/**
 * Story 29.2 — RFC 9421 signing envelope type definitions.
 *
 * Architecture reference: Epic 29 §4.4, AD-64, AD-60.
 * These are pure type exports — no runtime behaviour, no DB, no API route.
 */

/** Signing purpose discriminator (architecture §4.4). */
export type SigningPurpose =
  | "pairing_complete"
  | "exchange"
  | "rotation_stage"
  | "rotation_activate"
  | "recovery_status";

/** Supported key algorithms (migration 060 CHECK, architecture §4.4 table). */
export type KeyAlgorithm = "ecdsa-p256" | "ed25519" | "rsa-pss-2048";

/**
 * A device proof-of-possession input for `verifyDeviceSignature`.
 *
 * The verifier receives the signature and the bound request-context fields.
 * No private key is ever present — only the public key (NFR1).
 */
export interface DeviceProof {
  /** HTTP method (uppercase) used in the signed request. */
  readonly method: string;
  /** Request target (path + query) — the server reconstructs @target-uri from origin + this. */
  readonly requestTarget: string;
  /** Raw request body bytes bound via Content-Digest (RFC 9530). */
  readonly body: Uint8Array;
  /** Content-Digest header value as received (e.g. `sha-256=:<base64>:`). */
  readonly contentDigestHeader: string;
  /** x-allura-purpose header value. */
  readonly purpose: SigningPurpose;
  /** x-allura-audience header value. */
  readonly audience: string;
  /** x-allura-nonce header value (challenge nonce or completion_nonce). */
  readonly nonce: string;
  /** x-allura-proof-id header value (challenge id, receipt id, or enrollment id). */
  readonly proofId: string;
  /** x-allura-device-id header value — omitted for pairing_complete. */
  readonly deviceId?: string;
  /** x-allura-key-generation header value — omitted for pairing_complete. */
  readonly keyGeneration?: number;
  /** Signature-Input header value as received. */
  readonly signatureInputHeader: string;
  /** Signature header value as received (standard base64, not base64url). */
  readonly signatureHeader: string;
  /** Public key the signature is verified against (SPKI PEM or DER base64). */
  readonly publicKey: string;
  /** Key algorithm declared at enrollment. */
  readonly keyAlgorithm: KeyAlgorithm;
  /** Signature parameters parsed from Signature-Input. */
  readonly signatureParams: SignatureParams;
}

/** Parsed RFC 9421 signature parameters. */
export interface SignatureParams {
  /** Label (e.g. `sig1`). */
  readonly label: string;
  /** Covered components in order (derived + headers). */
  readonly coveredComponents: readonly string[];
  /** Unix timestamp the signature was created. */
  readonly created: number;
  /** Unix timestamp the signature expires. */
  readonly expires: number;
  /** Key id. */
  readonly keyid: string;
  /** Algorithm token. */
  readonly alg: string;
}

/** Successful verification result. */
export interface VerifiedProof {
  readonly valid: true;
  readonly purpose: SigningPurpose;
  readonly deviceId?: string;
  readonly keyGeneration?: number;
}

/** Failed verification result. */
export interface InvalidProof {
  readonly valid: false;
  readonly reason: string;
}

/** Discriminated union result of `verifyDeviceSignature`. */
export type VerifyResult = VerifiedProof | InvalidProof;