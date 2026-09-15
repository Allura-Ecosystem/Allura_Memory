import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
  parseSignatureInput,
  reconstructTargetUri,
  verifyDeviceSignature,
} from "../rfc9421";
import type { DeviceProof } from "../rfc9421-types";

const ORIGIN = "https://api.allura.example.com";
const AUDIENCE = "https://api.allura.example.com/device-auth";

describe("Story 29.2 @target-uri reconstruction (AD-64)", () => {
  it("reconstructs @target-uri from configured origin + path", () => {
    expect(
      reconstructTargetUri("https://api.allura.example.com", "/api/device-pairing/exchange"),
    ).toBe("https://api.allura.example.com/api/device-pairing/exchange");
  });

  it("reconstructs @target-uri with query string", () => {
    expect(
      reconstructTargetUri("https://api.allura.example.com", "/api/device-pairing/exchange?foo=bar"),
    ).toBe("https://api.allura.example.com/api/device-pairing/exchange?foo=bar");
  });

  it("strips trailing slash from origin", () => {
    expect(
      reconstructTargetUri("https://api.allura.example.com/", "/api/device-pairing/exchange"),
    ).toBe("https://api.allura.example.com/api/device-pairing/exchange");
  });

  it("prepends slash if target lacks one", () => {
    expect(
      reconstructTargetUri("https://api.allura.example.com", "api/device-pairing/exchange"),
    ).toBe("https://api.allura.example.com/api/device-pairing/exchange");
  });

  it("does NOT use Host header — the verifier never receives Host", () => {
    // The verifier function accepts only origin + requestTarget.
    // There is no Host parameter. This test asserts the signature.
    const fn = reconstructTargetUri;
    expect(fn.length).toBe(2);
  });

  it("Host rewrite is rejected — signature over configured-origin @target-uri fails when verified against a different origin", () => {
    // A MITM rewrites Host from api.allura.example.com to evil.proxy.com.
    // The bridge signed @target-uri using ALLURA_DEVICE_AUTH_ORIGIN (api.allura.example.com).
    // The server verifies against the configured origin (api.allura.example.com),
    // NOT the Host header. If someone tried to verify against the rewritten Host,
    // the signature would fail. This test proves the verifier uses the configured origin.
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    const body = Buffer.from('{"device_id":"dev_abc"}');
    const digest = computeContentDigest(body);
    const created = Math.floor(Date.now() / 1000);
    const expires = created + 60;

    const covered = [
      "@method",
      "@target-uri",
      "content-digest",
      "x-allura-purpose",
      "x-allura-audience",
      "x-allura-nonce",
      "x-allura-proof-id",
      "x-allura-device-id",
      "x-allura-key-generation",
    ];

    const sigInputHeader = `sig1=(${covered.map((c) => `"${c}"`).join(" ")});created=${created};expires=${expires};keyid="kid_test";alg="ecdsa-p256"`;

    const headersMap: Record<string, string | undefined> = {
      "x-allura-purpose": "exchange",
      "x-allura-audience": AUDIENCE,
      "x-allura-nonce": "nonce_value",
      "x-allura-proof-id": "chal_uuid",
      "x-allura-device-id": "dev_abc",
      "x-allura-key-generation": "1",
    };

    // Bridge signs with the configured origin
    const correctTargetUri = `${ORIGIN}/api/device-pairing/exchange`;
    const sigParamsRaw = extractSignatureParamsRaw(sigInputHeader);
    const baseString = buildSignatureBaseString(
      "POST",
      correctTargetUri,
      digest,
      headersMap,
      covered,
      sigParamsRaw,
    );
    const sigBytes = sign("SHA256", Buffer.from(baseString, "utf8"), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });

    const proof: DeviceProof = {
      method: "POST",
      requestTarget: "/api/device-pairing/exchange",
      body,
      contentDigestHeader: digest,
      purpose: "exchange",
      audience: AUDIENCE,
      nonce: "nonce_value",
      proofId: "chal_uuid",
      deviceId: "dev_abc",
      keyGeneration: 1,
      signatureInputHeader: sigInputHeader,
      signatureHeader: sigBytes.toString("base64"),
      publicKey: publicKeyPem,
      keyAlgorithm: "ecdsa-p256",
      signatureParams: parseSignatureInput(sigInputHeader),
    };

    // Verifying with the correct origin succeeds
    const resultCorrect = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
    expect(resultCorrect.valid).toBe(true);

    // Verifying with a rewritten Host origin fails — the signature was
    // over the configured origin, not the attacker's Host
    const EVIL_ORIGIN = "https://evil.proxy.com";
    const resultEvil = verifyDeviceSignature(proof, EVIL_ORIGIN, AUDIENCE);
    expect(resultEvil.valid).toBe(false);
  });
});