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
  extractStructuredSignatureValue,
  hasExactCoveredComponents,
  parseSignatureInput,
  verifyDeviceSignature,
} from "../rfc9421";
import type {
  DeviceProof,
  KeyAlgorithm,
  SigningPurpose,
} from "../rfc9421-types";

const ORIGIN = "https://api.allura.example.com";
const AUDIENCE = "https://api.allura.example.com/device-auth";

interface TestKey {
  publicKeyPem: string;
  privateKey: KeyObject;
  algorithm: KeyAlgorithm;
}

function makeTestKey(algorithm: KeyAlgorithm): TestKey {
  switch (algorithm) {
    case "ecdsa-p256": {
      const { publicKey, privateKey } = generateKeyPairSync("ec", {
        namedCurve: "P-256",
      });
      return {
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
        privateKey,
        algorithm,
      };
    }
    case "ed25519": {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      return {
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
        privateKey,
        algorithm,
      };
    }
    case "rsa-pss-2048": {
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      return {
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
        privateKey,
        algorithm,
      };
    }
  }
}

function signData(
  algorithm: KeyAlgorithm,
  privateKey: KeyObject,
  data: Buffer,
): Buffer {
  switch (algorithm) {
    case "ecdsa-p256":
      return sign("SHA256", data, {
        key: privateKey,
        dsaEncoding: "ieee-p1363",
      });
    case "ed25519":
      return sign(null, data, privateKey);
    case "rsa-pss-2048":
      return sign("RSA-SHA256", data, {
        key: privateKey,
        padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
        saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
      });
  }
}

function makeSignatureInputHeader(
  coveredComponents: readonly string[],
  created: number,
  expires: number,
  keyid: string,
  alg: string,
): string {
  const comps = coveredComponents.map((c) => `"${c}"`).join(" ");
  return `sig1=(${comps});created=${created};expires=${expires};keyid="${keyid}";alg="${alg}"`;
}

function buildProofForPurpose(
  purpose: SigningPurpose,
  testKey: TestKey,
  options: {
    method?: string;
    requestTarget?: string;
    body?: Buffer;
    deviceId?: string;
    keyGeneration?: number;
    nonce?: string;
    proofId?: string;
    audience?: string;
  } = {},
): DeviceProof {
  const method = options.method ?? "POST";
  const requestTarget =
    options.requestTarget ?? "/api/device-pairing/exchange";
  const body = options.body ?? Buffer.from('{"device_id":"dev_test"}');
  const digest = computeContentDigest(body);
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 60;

  const isPairingComplete = purpose === "pairing_complete";
  const deviceId = isPairingComplete ? undefined : (options.deviceId ?? "dev_abc");
  const keyGeneration = isPairingComplete ? undefined : (options.keyGeneration ?? 1);
  const proofId = options.proofId ?? (isPairingComplete ? "enroll_xyz" : "chal_uuid");
  const nonce = options.nonce ?? "base64urlnonce";
  const audience = options.audience ?? AUDIENCE;

  // Build covered components based on purpose (device-id/key-gen omitted for pairing_complete)
  const covered: string[] = [
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

  const sigInputHeader = makeSignatureInputHeader(
    covered,
    created,
    expires,
    "kid_test",
    testKey.algorithm,
  );

  const headersMap: Record<string, string | undefined> = {
    "x-allura-purpose": purpose,
    "x-allura-audience": audience,
    "x-allura-nonce": nonce,
    "x-allura-proof-id": proofId,
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

  const sigBytes = signData(testKey.algorithm, testKey.privateKey, Buffer.from(baseString, "utf8"));

  return {
    method,
    requestTarget,
    body,
    contentDigestHeader: digest,
    purpose,
    audience,
    nonce,
    proofId,
    deviceId,
    keyGeneration,
    signatureInputHeader: sigInputHeader,
    signatureHeader: sigBytes.toString("base64"),
    publicKey: testKey.publicKeyPem,
    keyAlgorithm: testKey.algorithm,
    signatureParams: parseSignatureInput(sigInputHeader),
  };
}

const ALL_PURPOSES: SigningPurpose[] = [
  "pairing_complete",
  "exchange",
  "rotation_stage",
  "rotation_activate",
  "recovery_status",
];

const ALL_ALGORITHMS: KeyAlgorithm[] = [
  "ecdsa-p256",
  "ed25519",
  "rsa-pss-2048",
];

describe("Story 29.2 RFC 9421 payload verification (all 5 purposes, all 3 algorithms)", () => {
  it("builds the RFC 9421 base with method case preserved and no terminal newline", () => {
    const signatureInput = 'sig1=("@method" "@target-uri" "content-digest");created=1700000000;expires=1700000060;keyid="kid_42";alg="ed25519"';
    const base = buildSignatureBaseString(
      "POST",
      "https://api.allura.example.com/device-auth",
      "sha-256=:digest=:",
      {},
      ["@method", "@target-uri", "content-digest"],
      extractSignatureParamsRaw(signatureInput),
    );

    expect(base).toBe(
      '"@method": POST\n' +
        '"@target-uri": https://api.allura.example.com/device-auth\n' +
        '"content-digest": sha-256=:digest=:\n' +
        '"@signature-params": ("@method" "@target-uri" "content-digest");created=1700000000;expires=1700000060;keyid="kid_42";alg="ed25519"',
    );
  });

  it("verifyDeviceSignature returns valid for every purpose with a correct signature", () => {
    const key = makeTestKey("ecdsa-p256");
    for (const purpose of ALL_PURPOSES) {
      const proof = buildProofForPurpose(purpose, key, {
        requestTarget:
          purpose === "pairing_complete"
            ? "/api/device-pairing/complete"
            : purpose === "exchange"
              ? "/api/device-pairing/exchange"
              : purpose === "rotation_stage"
                ? "/api/device-pairing/rotation/stage"
                : purpose === "rotation_activate"
                  ? "/api/device-pairing/rotation/activate"
                  : "/api/device-pairing/recovery",
      });
      const result = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
      expect(result.valid, `purpose=${purpose}`).toBe(true);
      if (result.valid) {
        expect(result.purpose).toBe(purpose);
      }
    }
  });

  it("verifyDeviceSignature returns valid for every supported algorithm", () => {
    for (const algorithm of ALL_ALGORITHMS) {
      const key = makeTestKey(algorithm);
      const proof = buildProofForPurpose("exchange", key);
      const result = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
      expect(result.valid, `algorithm=${algorithm}`).toBe(true);
    }
  });

  it("verifyDeviceSignature returns deviceId and keyGeneration for non-pairing_complete", () => {
    const key = makeTestKey("ecdsa-p256");
    const proof = buildProofForPurpose("exchange", key, {
      deviceId: "dev_my_device",
      keyGeneration: 3,
    });
    const result = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.deviceId).toBe("dev_my_device");
      expect(result.keyGeneration).toBe(3);
    }
  });

  it("verifyDeviceSignature omits deviceId/keyGeneration for pairing_complete", () => {
    const key = makeTestKey("ecdsa-p256");
    const proof = buildProofForPurpose("pairing_complete", key, {
      requestTarget: "/api/device-pairing/complete",
    });
    const result = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.deviceId).toBeUndefined();
      expect(result.keyGeneration).toBeUndefined();
    }
  });

  it("verifyDeviceSignature rejects an audience mismatch", () => {
    const key = makeTestKey("ecdsa-p256");
    const proof = buildProofForPurpose("exchange", key, {
      audience: "https://wrong-audience.example.com",
    });
    const result = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("audience mismatch");
    }
  });

  it("verifyDeviceSignature rejects an RFC alg parameter that disagrees with the enrolled key algorithm", () => {
    const key = makeTestKey("ed25519");
    const proof = buildProofForPurpose("exchange", key);
    const mismatched: DeviceProof = {
      ...proof,
      signatureInputHeader: proof.signatureInputHeader.replace('alg="ed25519"', 'alg="ecdsa-p256"'),
      signatureParams: { ...proof.signatureParams, alg: "ecdsa-p256" },
    };

    const result = verifyDeviceSignature(mismatched, ORIGIN, AUDIENCE);
    expect(result).toEqual({ valid: false, reason: "signature algorithm mismatch" });
  });

  it("verifyDeviceSignature rejects a tampered signature", () => {
    const key = makeTestKey("ecdsa-p256");
    const proof = buildProofForPurpose("exchange", key);
    // Flip a byte in the signature
    const sigBytes = Buffer.from(proof.signatureHeader, "base64");
    sigBytes[0] ^= 0xff;
    const tampered: DeviceProof = {
      ...proof,
      signatureHeader: sigBytes.toString("base64"),
    };
    const result = verifyDeviceSignature(tampered, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(false);
  });

  it("verifyDeviceSignature rejects a wrong public key", () => {
    const key = makeTestKey("ecdsa-p256");
    const otherKey = makeTestKey("ecdsa-p256");
    const proof = buildProofForPurpose("exchange", key, {});
    const wrongKey: DeviceProof = {
      ...proof,
      publicKey: otherKey.publicKeyPem,
    };
    const result = verifyDeviceSignature(wrongKey, ORIGIN, AUDIENCE);
    expect(result.valid).toBe(false);
  });

  it("verifyDeviceSignature is deterministic — same input, same result", () => {
    const key = makeTestKey("ed25519");
    const proof = buildProofForPurpose("exchange", key);
    const r1 = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
    const r2 = verifyDeviceSignature(proof, ORIGIN, AUDIENCE);
    expect(r1.valid).toBe(r2.valid);
  });

  it("extracts only the matching structured Signature dictionary member", () => {
    expect(extractStructuredSignatureValue("sig1=:ZmFrZQ==:", "sig1")).toBe("ZmFrZQ==");
    expect(extractStructuredSignatureValue("other=:b3RoZXI=:, sig1=:ZmFrZQ==:", "sig1")).toBe("ZmFrZQ==");
    expect(() => extractStructuredSignatureValue("sig2=:ZmFrZQ==:", "sig1")).toThrow(/missing/i);
    expect(() => extractStructuredSignatureValue("sig1=ZmFrZQ==", "sig1")).toThrow(/malformed/i);
  });

  it("rejects Signature-Input without a structured-field inner list", () => {
    const malformed = 'sig1="@method" "@target-uri" "content-digest";created=1000;expires=1060;keyid="kid_42";alg="ecdsa-p256"';
    expect(() => parseSignatureInput(malformed)).toThrow(/inner list/i);
  });

  it("rejects malformed Signature-Input component and parameter types", () => {
    expect(() => parseSignatureInput('sig1=("@method" junk);created=1000;expires=1060;keyid="kid_42";alg="ecdsa-p256"')).toThrow(/components/i);
    expect(() => parseSignatureInput('sig1=("@method");created="1000";expires=1060;keyid="kid_42";alg="ecdsa-p256"')).toThrow(/created/i);
    expect(() => parseSignatureInput('sig1=("@method");created=1000;expires=1060;keyid=kid_42;alg="ecdsa-p256"')).toThrow(/keyid/i);
  });

  it("requires exactly the canonical unique recovery components", () => {
    const canonical = [
      "@method", "@target-uri", "content-digest", "x-allura-purpose",
      "x-allura-audience", "x-allura-nonce", "x-allura-proof-id",
      "x-allura-device-id", "x-allura-key-generation",
    ];

    expect(hasExactCoveredComponents(canonical, canonical)).toBe(true);
    expect(hasExactCoveredComponents([...canonical, "x-allura-purpose"], canonical)).toBe(false);
    expect(hasExactCoveredComponents([...canonical, "x-unrelated"], canonical)).toBe(false);
  });

  it("Signature-Input parsing extracts covered components, created, expires, keyid, alg", () => {
    const header = makeSignatureInputHeader(
      ["@method", "@target-uri", "content-digest", "x-allura-purpose"],
      1000,
      1060,
      "kid_42",
      "ecdsa-p256",
    );
    const parsed = parseSignatureInput(header);
    expect(parsed.label).toBe("sig1");
    expect(parsed.coveredComponents).toEqual([
      "@method",
      "@target-uri",
      "content-digest",
      "x-allura-purpose",
    ]);
    expect(parsed.created).toBe(1000);
    expect(parsed.expires).toBe(1060);
    expect(parsed.keyid).toBe("kid_42");
    expect(parsed.alg).toBe("ecdsa-p256");
  });
});