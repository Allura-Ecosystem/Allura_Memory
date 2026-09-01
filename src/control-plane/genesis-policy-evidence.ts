import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";

import type { ProjectManifest, SourceOfTruthRead } from "./policy";
import { getControlPlaneSecretKey } from "./proof";

const EVIDENCE_TTL_MS = 5 * 60 * 1000;

type GenesisPolicyEvidencePayload = {
  actor: string;
  groupId: string;
  approvalRef: string;
  jti: string;
  target: string;
  mutationDigest: string;
  projectManifest: ProjectManifest;
  sourceOfTruthReads: SourceOfTruthRead[];
  issuedAt: number;
  expiresAt: number;
};

export interface GenesisPolicyEvidenceInput {
  actor: string;
  groupId: string;
  approvalRef: string;
  /** Canonical syscall target this evidence may authorize. */
  target: string;
  /** SHA-256 of the canonical mutation data sent to that target. */
  mutationDigest: string;
  projectManifest: ProjectManifest;
  sourceOfTruthReads: SourceOfTruthRead[];
}

export interface ResolvedGenesisPolicyEvidence {
  actor: string;
  approvalRef: string;
  jti: string;
  target: string;
  mutationDigest: string;
  policyContext: {
    projectManifest: ProjectManifest;
    sourceOfTruthReads: SourceOfTruthRead[];
  };
}

function sign(payload: string): string {
  return createHmac("sha256", getControlPlaneSecretKey()).update(payload).digest("base64url");
}

/** Deterministic serialization for evidence-to-mutation bindings. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function genesisMutationDigest(target: string, data: unknown): string {
  return createHash("sha256").update(canonicalJson({ target, data })).digest("hex");
}

/** Issues opaque, short-lived evidence from a trusted control-plane resolver. */
export function issueGenesisPolicyEvidence(input: GenesisPolicyEvidenceInput): string {
  const now = Date.now();
  const payload: GenesisPolicyEvidencePayload = {
    ...input,
    jti: randomUUID(),
    issuedAt: now,
    expiresAt: now + EVIDENCE_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

/** Resolves only cryptographically verified, tenant- and mutation-bound evidence. */
export function resolveGenesisPolicyEvidence(
  token: string,
  expectedGroupId: string,
  expectedTarget?: string,
  expectedMutationData?: unknown,
): ResolvedGenesisPolicyEvidence {
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length > 0) throw new Error("Genesis policy evidence is malformed");

  const expectedSignature = sign(encodedPayload);
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("Genesis policy evidence signature is invalid");
  }

  let payload: GenesisPolicyEvidencePayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Genesis policy evidence payload is invalid");
  }
  if (!payload || payload.groupId !== expectedGroupId) throw new Error("Genesis policy evidence group_id does not match syscall context");
  if (!payload.actor || !payload.approvalRef || !payload.jti || !payload.target || !payload.mutationDigest || !payload.projectManifest || !Array.isArray(payload.sourceOfTruthReads)) {
    throw new Error("Genesis policy evidence is incomplete");
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) throw new Error("Genesis policy evidence has expired");
  if (expectedTarget && (payload.target !== expectedTarget || payload.mutationDigest !== genesisMutationDigest(expectedTarget, expectedMutationData))) {
    throw new Error("Genesis policy evidence mutation binding does not match syscall target or digest");
  }

  return {
    actor: payload.actor,
    approvalRef: payload.approvalRef,
    jti: payload.jti,
    target: payload.target,
    mutationDigest: payload.mutationDigest,
    policyContext: { projectManifest: payload.projectManifest, sourceOfTruthReads: payload.sourceOfTruthReads },
  };
}
