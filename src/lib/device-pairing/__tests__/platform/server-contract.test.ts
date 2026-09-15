import { describe, expect, it } from "vitest";
import {
  constants as cryptoConstants,
  generateKeyPairSync,
  type KeyObject,
  sign,
} from "node:crypto";


import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
  parseSignatureInput,
  validateDevicePublicKey,
  verifyDeviceSignature,
} from "../../rfc9421";
import type { DeviceProof, KeyAlgorithm } from "../../rfc9421-types";

const ORIGIN = "https://api.allura.example.test";
const AUDIENCE = "https://api.allura.example.test/device-auth";
const COVERED = [
  "@method",
  "@target-uri",
  "content-digest",
  "x-allura-purpose",
  "x-allura-audience",
  "x-allura-nonce",
  "x-allura-proof-id",
  "x-allura-device-id",
  "x-allura-key-generation",
] as const;

interface GeneratedKey {
  readonly algorithm: KeyAlgorithm;
  readonly privateKey: KeyObject;
  readonly publicKeyPem: string;
  readonly publicKeySpkiBase64: string;
}

function generateKey(algorithm: KeyAlgorithm): GeneratedKey {
  const pair = algorithm === "ecdsa-p256"
    ? generateKeyPairSync("ec", { namedCurve: "P-256" })
    : algorithm === "ed25519"
      ? generateKeyPairSync("ed25519")
      : generateKeyPairSync("rsa", { modulusLength: 2048 });
  const spki = pair.publicKey.export({ type: "spki", format: "der" });

  return {
    algorithm,
    privateKey: pair.privateKey,
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    publicKeySpkiBase64: Buffer.from(spki).toString("base64"),
  };
}

function signP1363RawOrPss(key: GeneratedKey, data: Buffer): Buffer {
  switch (key.algorithm) {
    case "ecdsa-p256":
      return sign("SHA256", data, { key: key.privateKey, dsaEncoding: "ieee-p1363" });
    case "ed25519":
      return sign(null, data, key.privateKey);
    case "rsa-pss-2048":
      return sign("RSA-SHA256", data, {
        key: key.privateKey,
        padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
        saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
      });
  }
}

function proofFor(key: GeneratedKey, publicKey = key.publicKeyPem): DeviceProof {
  const method = "POST";
  const requestTarget = "/api/device-pairing/exchange";
  const body = Buffer.from('{"device_id":"device-contract"}');
  const contentDigestHeader = computeContentDigest(body);
  const signatureInputHeader = `sig1=(${COVERED.map((component) => `"${component}"`).join(" ")});created=1700000000;expires=1700000060;keyid="contract-key";alg="${key.algorithm}"`;
  const headers = {
    "x-allura-purpose": "exchange",
    "x-allura-audience": AUDIENCE,
    "x-allura-nonce": "contract-nonce",
    "x-allura-proof-id": "contract-challenge",
    "x-allura-device-id": "device-contract",
    "x-allura-key-generation": "1",
  };
  const base = buildSignatureBaseString(
    method,
    `${ORIGIN}${requestTarget}`,
    contentDigestHeader,
    headers,
    COVERED,
    extractSignatureParamsRaw(signatureInputHeader),
  );
  const signatureHeader = signP1363RawOrPss(key, Buffer.from(base, "utf8")).toString("base64");

  return {
    method,
    requestTarget,
    body,
    contentDigestHeader,
    purpose: "exchange",
    audience: AUDIENCE,
    nonce: "contract-nonce",
    proofId: "contract-challenge",
    deviceId: "device-contract",
    keyGeneration: 1,
    signatureInputHeader,
    signatureHeader,
    publicKey,
    keyAlgorithm: key.algorithm,
    signatureParams: parseSignatureInput(signatureInputHeader),
  };
}

describe("Story 29.21 server key and RFC 9421 contract", () => {
  it.each(["ecdsa-p256", "ed25519", "rsa-pss-2048"] as const)(
    "accepts a valid SPKI PEM and base64 SPKI DER public key for %s",
    (algorithm) => {
      const key = generateKey(algorithm);

      expect(validateDevicePublicKey(algorithm, key.publicKeyPem)).toBe(true);
      expect(validateDevicePublicKey(algorithm, key.publicKeySpkiBase64)).toBe(true);
    },
  );

  it("rejects malformed, non-SPKI, and algorithm-mismatched public keys without throwing from the server verifier", () => {
    const p256 = generateKey("ecdsa-p256");
    const ed25519 = generateKey("ed25519");

    expect(validateDevicePublicKey("ecdsa-p256", "not-base64-or-pem")).toBe(false);
    expect(validateDevicePublicKey("ecdsa-p256", "-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----")).toBe(false);
    expect(validateDevicePublicKey("ecdsa-p256", ed25519.publicKeyPem)).toBe(false);

    expect(() => verifyDeviceSignature(proofFor(p256, "not-base64-or-pem"), ORIGIN, AUDIENCE)).not.toThrow();
    expect(verifyDeviceSignature(proofFor(p256, "not-base64-or-pem"), ORIGIN, AUDIENCE).valid).toBe(false);
  });

  it.each([
    ["ecdsa-p256", "IEEE P1363 r||s", 64],
    ["ed25519", "raw Ed25519", 64],
    ["rsa-pss-2048", "RSA-PSS-2048", 256],
  ] as const)("verifies a %s %s signature with exactly %i bytes", (algorithm, _format, bytes) => {
    const key = generateKey(algorithm);
    const proof = proofFor(key, key.publicKeySpkiBase64);

    expect(Buffer.from(proof.signatureHeader, "base64")).toHaveLength(bytes);
    expect(verifyDeviceSignature(proof, ORIGIN, AUDIENCE).valid).toBe(true);
  });
});
