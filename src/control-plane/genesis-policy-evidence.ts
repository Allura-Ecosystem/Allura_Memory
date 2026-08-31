import { createHmac, timingSafeEqual } from "crypto";

import {
  getControlPlaneSecretKey,
} from "./proof";
import type { ProjectManifest, SourceOfTruthRead } from "./policy";

const EVIDENCE_TTL_MS = 5 * 60 * 1000;

type GenesisPolicyEvidencePayload = {
  actor: string;
  groupId: string;
  approvalRef: string;
  projectManifest: ProjectManifest;
  sourceOfTruthReads: SourceOfTruthRead[];
  issuedAt: number;
  expiresAt: number;
};

export interface GenesisPolicyEvidenceInput {
  actor: string;
  groupId: string;
  approvalRef: string;
  projectManifest: ProjectManifest;
  sourceOfTruthReads: SourceOfTruthRead[];
}

export interface ResolvedGenesisPolicyEvidence {
  actor: string;
  approvalRef: string;
  policyContext: {
    projectManifest: ProjectManifest;
    sourceOfTruthReads: SourceOfTruthRead[];
  };
}

function sign(payload: string): string {
  return createHmac("sha256", getControlPlaneSecretKey()).update(payload).digest("base64url");
}

/**
 * Issues opaque, short-lived evidence from a trusted control-plane resolver.
 *
 * Production callers must receive this token from their server-side authority
 * resolver; raw manifest/read/target fields are deliberately not accepted by
 * Genesis proposal writes.
 */
export function issueGenesisPolicyEvidence(input: GenesisPolicyEvidenceInput): string {
  const now = Date.now();
  const payload: GenesisPolicyEvidencePayload = {
    ...input,
    issuedAt: now,
    expiresAt: now + EVIDENCE_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

/** Resolves only cryptographically verified, tenant-bound Genesis evidence. */
export function resolveGenesisPolicyEvidence(
  token: string,
  expectedGroupId: string
): ResolvedGenesisPolicyEvidence {
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length > 0) {
    throw new Error("Genesis policy evidence is malformed");
  }

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

  if (!payload || payload.groupId !== expectedGroupId) {
    throw new Error("Genesis policy evidence group_id does not match syscall context");
  }
  if (!payload.actor || !payload.approvalRef || !payload.projectManifest || !Array.isArray(payload.sourceOfTruthReads)) {
    throw new Error("Genesis policy evidence is incomplete");
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) {
    throw new Error("Genesis policy evidence has expired");
  }

  return {
    actor: payload.actor,
    approvalRef: payload.approvalRef,
    policyContext: {
      projectManifest: payload.projectManifest,
      sourceOfTruthReads: payload.sourceOfTruthReads,
    },
  };
}
