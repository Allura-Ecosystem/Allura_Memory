import type { KeyAlgorithm } from "../rfc9421-types";

/**
 * B2 desktop secure-store boundary. The interface exposes public-key material
 * and signing only; it has no private-key read/export method. Platform storage
 * capabilities are reported explicitly because non-exportability is not uniform.
 */
export interface ISecureKeyStore {
  /** Create or return the durable, named device key. */
  getOrCreate(input: SecureKeyStoreCreateInput): Promise<SecureKeyReference>;
  /** Return public SPKI material only; no private-key read/export API exists. */
  getPublicKey(keyId: string): Promise<SecureKeyPublicMaterial>;
  /** Sign the RFC 9421 base string with the durable private key. */
  sign(keyId: string, message: Uint8Array): Promise<Uint8Array>;
  /** Delete the named key on device unlink/revocation. */
  delete(keyId: string): Promise<void>;
  /** Report capability truthfully so the bridge can fail closed when unavailable. */
  getCapabilities(): Promise<SecureKeyStoreCapabilities>;
}

export interface SecureKeyStoreCreateInput {
  readonly keyId: string;
  readonly algorithm: KeyAlgorithm;
}

export interface SecureKeyReference {
  readonly keyId: string;
  readonly algorithm: KeyAlgorithm;
}

export interface SecureKeyPublicMaterial extends SecureKeyReference {
  /** SPKI PEM or canonical standard-base64 SPKI DER accepted by the server. */
  readonly publicKey: string;
}

export interface SecureKeyStoreCapabilities {
  readonly available: boolean;
  /** True only where the platform/API proves private-key export is blocked. */
  readonly nonExportable: boolean;
  /** True only for encrypted OS keyring storage, never a plaintext-file fallback. */
  readonly encryptedAtRest: boolean;
  /** True when the OS store restricts use to the owning user/session. */
  readonly accessControlled: boolean;
}
