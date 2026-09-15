import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
  parseSignatureInput,
  verifyDeviceSignature,
} from "../rfc9421";
import type { DeviceProof, SigningPurpose } from "../rfc9421-types";

const ORIGIN = "https://api.allura.example.com";
const AUDIENCE = "https://api.allura.example.com/device-auth";

function buildSignedProof(
  purpose: SigningPurpose,
  privateKey: KeyObject,
  publicKeyPem: string,
  body: Buffer,
  requestTarget: string,
  options: {
    deviceId?: string;
    keyGeneration?: number;
  } = {},
): DeviceProof {
  const method = "POST";
  const digest = computeContentDigest(body);
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 60;

  const isPairingComplete = purpose === "pairing_complete";
  const deviceId = isPairingComplete ? undefined : (options.deviceId ?? "dev_abc");
  const keyGeneration = isPairingComplete ? undefined : (options.keyGeneration ?? 1);

  const covered = [
    "@method",
    "@target-uri",
    "content-digest",
    "x-allura-purpose",
    "x-allura-audience",
    "x-allura-nonce",
    "x-allura-proof-id",
  ];
  if (!isPairingComplete) {
    covered.push("x-allura-device-id", "x-allura-key-generation");
  }

  const sigInputHeader = `sig1=(${covered.map((c) => `"${c}"`).join(" ")});created=${created};expires=${expires};keyid="kid_test";alg="ecdsa-p256"`;

  const headersMap: Record<string, string | undefined> = {
    "x-allura-purpose": purpose,
    "x-allura-audience": AUDIENCE,
    "x-allura-nonce": "nonce_value",
    "x-allura-proof-id": isPairingComplete ? "enroll_xyz" : "chal_uuid",
    "x-allura-device-id": deviceId,
    "x-allura-key-generation": keyGeneration?.toString(),
  };

  const sigParamsRaw = extractSignatureParamsRaw(sigInputHeader);
  const targetUri = `${ORIGIN}${requestTarget}`;

  const baseString = buildSignatureBaseString(
    method,
    targetUri,
    digest,
    headersMap,
    covered,
    sigParamsRaw,
  );

  const sigBytes = sign("SHA256", Buffer.from(baseString, "utf8"), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return {
    method,
    requestTarget,
    body,
    contentDigestHeader: digest,
    purpose,
    audience: AUDIENCE,
    nonce: "nonce_value",
    proofId: isPairingComplete ? "enroll_xyz" : "chal_uuid",
    deviceId,
    keyGeneration,
    signatureInputHeader: sigInputHeader,
    signatureHeader: sigBytes.toString("base64"),
    publicKey: publicKeyPem,
    keyAlgorithm: "ecdsa-p256",
    signatureParams: parseSignatureInput(sigInputHeader),
  };
}

describe("Story 29.2 MITM body-swap rejection (RFC 9530 Content-Digest binding)", () => {
  it("rejects a body swap where the signature was over the original body but the verifier receives a different body", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const publicKeyPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const originalBody = Buffer.from('{"device_id":"dev_legit"}');
    const swappedBody = Buffer.from('{"device_id":"dev_evil"}');

    // The bridge signs the original body correctly
    const proof = buildSignedProof(
      "exchange",
      privateKey,
      publicKeyPem,
      originalBody,
      "/api/device-pairing/exchange",
    );

    // MITM swaps the body but keeps the original signature and digest
    const swappedProof: DeviceProof = {
      ...proof,
      body: swappedBody,
    };

    const result = verifyDeviceSignature(swappedProof, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("content-digest mismatch");
    }
  });

  it("rejects a body swap where the MITM also updates the Content-Digest but the signature was over the original", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const publicKeyPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const originalBody = Buffer.from('{"device_id":"dev_legit"}');
    const swappedBody = Buffer.from('{"device_id":"dev_evil"}');

    const proof = buildSignedProof(
      "exchange",
      privateKey,
      publicKeyPem,
      originalBody,
      "/api/device-pairing/exchange",
    );

    // MITM swaps the body AND recomputes the Content-Digest for the swapped body
    // But the signature was over the original base string (which includes the original digest)
    const swappedDigest = computeContentDigest(swappedBody);
    const swappedProof: DeviceProof = {
      ...proof,
      body: swappedBody,
      contentDigestHeader: swappedDigest,
    };

    const result = verifyDeviceSignature(swappedProof, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(false);
    // The signature verification fails because the base string has changed
    if (!result.valid) {
      expect(result.reason).toBe("signature verification failed");
    }
  });

  it("accepts the original body with the original signature (control)", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const publicKeyPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const body = Buffer.from('{"device_id":"dev_legit"}');
    const proof = buildSignedProof(
      "exchange",
      privateKey,
      publicKeyPem,
      body,
      "/api/device-pairing/exchange",
    );

    const result = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(true);
  });

  it("rejects an empty body swap (original non-empty, swapped empty)", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const publicKeyPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const originalBody = Buffer.from('{"device_id":"dev_legit"}');
    const emptyBody = Buffer.alloc(0);

    const proof = buildSignedProof(
      "exchange",
      privateKey,
      publicKeyPem,
      originalBody,
      "/api/device-pairing/exchange",
    );

    const swappedProof: DeviceProof = {
      ...proof,
      body: emptyBody,
    };

    const result = verifyDeviceSignature(swappedProof, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(false);
  });
});