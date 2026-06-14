import { describe, expect, test } from "bun:test";
import {
  POLICY_PROMOTION_ROUNDTRIP,
  POLICY_READER_WRITER_SCHEMA_PARITY,
  POLICY_RETRIEVAL_CLAIM_PRECISION,
  type PolicyContext,
} from "../kernel/policy";
import type { ProofClaims } from "../kernel/proof";

const claims = {} as ProofClaims;
const baseContext: PolicyContext = {
  timestamp: Date.now(),
  operation: "memory:promote:done",
  resource: "allura-system",
};

describe("retrieval integrity policies", () => {
  test("POL-RET-001 rejects a stale claim when the graph is fresh", () => {
    expect(POLICY_RETRIEVAL_CLAIM_PRECISION.condition(claims, {
      ...baseContext,
      retrievalIntegrity: {
        graphHealthy: true,
        graphFresh: true,
        episodicFresh: true,
        claim: "stale",
      },
    })).toBe(false);
  });

  test("POL-RET-002 requires both public retrieval round-trips", () => {
    expect(POLICY_PROMOTION_ROUNDTRIP.condition(claims, {
      ...baseContext,
      promotionRoundtrip: {
        memoryGetPassed: true,
        memorySearchPassed: false,
      },
    })).toBe(false);
  });

  test("POL-RET-003 requires reader coverage and a live check after writer changes", () => {
    expect(POLICY_READER_WRITER_SCHEMA_PARITY.condition(claims, {
      ...baseContext,
      schemaParity: {
        writerSchemaChanged: true,
        readerCoveragePassed: true,
        liveRoundtripPassed: false,
      },
    })).toBe(false);
  });

  test("new policies remain inert when their evidence context is absent", () => {
    expect(POLICY_RETRIEVAL_CLAIM_PRECISION.condition(claims, baseContext)).toBe(true);
    expect(POLICY_PROMOTION_ROUNDTRIP.condition(claims, baseContext)).toBe(true);
    expect(POLICY_READER_WRITER_SCHEMA_PARITY.condition(claims, baseContext)).toBe(true);
  });
});
