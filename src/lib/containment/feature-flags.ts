/**
 * Per-connector feature flags (Story 26.6 AC-1: "feature-flagged and
 * independently disableable").
 *
 * Each connector defaults to DISABLED. This is a deliberately conservative
 * default: nothing in this repository has ever authorized arming a
 * real state-mutating security connector (token revocation, workspace
 * locking) anywhere, so requiring explicit opt-in per connector -- rather
 * than defaulting to enabled and requiring explicit opt-out -- is the
 * safer posture until an operator makes that call for a real deployment.
 */

import type { ContainmentConnector } from "./types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

const FLAG_ENV_VAR: Record<ContainmentConnector, string> = {
  mcp_token_revocation: "CONTAINMENT_MCP_TOKEN_REVOCATION_ENABLED",
  workspace_lock: "CONTAINMENT_WORKSPACE_LOCK_ENABLED",
  endpoint_isolation: "CONTAINMENT_ENDPOINT_ISOLATION_ENABLED",
}

/**
 * Whether a connector is enabled. Reads the env var fresh on every call
 * (not cached at module load) so a connector can be disabled at runtime
 * without a restart, matching AC-1's "independently disableable."
 */
export function isConnectorEnabled(connector: ContainmentConnector): boolean {
  return process.env[FLAG_ENV_VAR[connector]] === "true"
}

export function connectorFlagEnvVar(connector: ContainmentConnector): string {
  return FLAG_ENV_VAR[connector]
}
