/**
 * Normalized exposure matcher types.
 *
 * Story 26.3: read-only matching of threat advisories against the supply-chain
 * inventory. Re-exports inferred types from the Zod schemas.
 */

import type { z } from "zod";
import type {
  AlertState,
  ExposureAlert,
  ExposureMatch,
  ExposureQuery,
  FreshnessState,
  Indicator,
  IndicatorType,
  MatchType,
  Severity,
  ThreatAdvisory,
  TrustState,
} from "./schemas";

export type TrustState = z.infer<typeof TrustState>;
export type FreshnessState = z.infer<typeof FreshnessState>;
export type IndicatorType = z.infer<typeof IndicatorType>;
export type Indicator = z.infer<typeof Indicator>;
export type Severity = z.infer<typeof Severity>;
export type ThreatAdvisory = z.infer<typeof ThreatAdvisory>;
export type MatchType = z.infer<typeof MatchType>;
export type ExposureMatch = z.infer<typeof ExposureMatch>;
export type ExposureAlert = z.infer<typeof ExposureAlert>;
export type AlertState = z.infer<typeof AlertState>;
export type ExposureQuery = z.infer<typeof ExposureQuery>;
