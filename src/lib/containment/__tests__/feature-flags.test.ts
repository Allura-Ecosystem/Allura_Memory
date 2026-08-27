import { afterEach, describe, expect, it } from "vitest"
import { connectorFlagEnvVar, isConnectorEnabled } from "../feature-flags"

const ENV_VARS = [
  "CONTAINMENT_MCP_TOKEN_REVOCATION_ENABLED",
  "CONTAINMENT_WORKSPACE_LOCK_ENABLED",
  "CONTAINMENT_ENDPOINT_ISOLATION_ENABLED",
]

describe("Story 26.6 — isConnectorEnabled", () => {
  afterEach(() => {
    for (const key of ENV_VARS) delete process.env[key]
  })

  it("defaults every connector to disabled", () => {
    expect(isConnectorEnabled("mcp_token_revocation")).toBe(false)
    expect(isConnectorEnabled("workspace_lock")).toBe(false)
    expect(isConnectorEnabled("endpoint_isolation")).toBe(false)
  })

  it("enables only the connector whose flag is explicitly set to true", () => {
    process.env.CONTAINMENT_MCP_TOKEN_REVOCATION_ENABLED = "true"
    expect(isConnectorEnabled("mcp_token_revocation")).toBe(true)
    expect(isConnectorEnabled("workspace_lock")).toBe(false)
  })

  it("treats any value other than the literal string 'true' as disabled", () => {
    process.env.CONTAINMENT_WORKSPACE_LOCK_ENABLED = "1"
    expect(isConnectorEnabled("workspace_lock")).toBe(false)
  })

  it("exposes the exact env var name for each connector", () => {
    expect(connectorFlagEnvVar("mcp_token_revocation")).toBe("CONTAINMENT_MCP_TOKEN_REVOCATION_ENABLED")
    expect(connectorFlagEnvVar("workspace_lock")).toBe("CONTAINMENT_WORKSPACE_LOCK_ENABLED")
    expect(connectorFlagEnvVar("endpoint_isolation")).toBe("CONTAINMENT_ENDPOINT_ISOLATION_ENABLED")
  })
})
