import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { DegradedSubgraphResultSchema } from "./contract"
import {
  GRAPH_V2_ENABLED_ENV_VAR,
  graphV2RolloutState,
  GraphV2RolloutStateSchema,
  isGraphV2Enabled,
} from "./rollout"

const previousGraphV2Flag = process.env[GRAPH_V2_ENABLED_ENV_VAR]

afterEach(() => {
  if (previousGraphV2Flag === undefined) delete process.env[GRAPH_V2_ENABLED_ENV_VAR]
  else process.env[GRAPH_V2_ENABLED_ENV_VAR] = previousGraphV2Flag
})

describe("Graph V2 server-only rollout", () => {
  it("enables only for the exact value true", () => {
    expect(graphV2RolloutState("true")).toEqual({ enabled: true })
    expect(isGraphV2Enabled("true")).toBe(true)

    for (const value of ["false", "TRUE", "1", " true ", "yes", ""]) {
      expect(graphV2RolloutState(value).enabled, value).toBe(false)
      expect(isGraphV2Enabled(value), value).toBe(false)
    }
  })

  it("fails closed when the flag is missing", () => {
    delete process.env[GRAPH_V2_ENABLED_ENV_VAR]
    expect(graphV2RolloutState()).toEqual({
      enabled: false,
      unavailable: {
        contractVersion: "2.0",
        state: "degraded",
        reasonCode: "GRAPH_V2_UNAVAILABLE",
        retryable: false,
        action: "none",
        warnings: ["GRAPH_V2_UNAVAILABLE"],
      },
    })
  })

  it("does not expose missing, disabled, or malformed deployment configuration distinctions", () => {
    delete process.env[GRAPH_V2_ENABLED_ENV_VAR]
    const missing = graphV2RolloutState()
    const disabled = graphV2RolloutState("false")
    const invalid = graphV2RolloutState("secret-value")
    expect(disabled).toEqual(missing)
    expect(invalid).toEqual(missing)
    expect(JSON.stringify(invalid)).not.toContain("secret-value")
  })

  it("never represents disabled Graph V2 as a successful empty graph", () => {
    const disabled = graphV2RolloutState("false")
    expect(JSON.stringify(disabled)).not.toContain('"state":"empty"')
    expect(GraphV2RolloutStateSchema.safeParse(disabled).success).toBe(true)
    if (!disabled.enabled) expect(DegradedSubgraphResultSchema.safeParse(disabled.unavailable).success).toBe(true)
  })

  it("reads the server environment only at call time", () => {
    process.env[GRAPH_V2_ENABLED_ENV_VAR] = "true"
    expect(isGraphV2Enabled()).toBe(true)
    process.env[GRAPH_V2_ENABLED_ENV_VAR] = "false"
    expect(isGraphV2Enabled()).toBe(false)
  })
})
