import "server-only"

import { z } from "zod/v4"
import { FOCUSED_SUBGRAPH_CONTRACT_VERSION } from "./contract"

export const GRAPH_V2_ENABLED_ENV_VAR = "ALLURA_GRAPH_V2_ENABLED" as const

export const GraphV2UnavailableStateSchema = z.strictObject({
  contractVersion: z.literal(FOCUSED_SUBGRAPH_CONTRACT_VERSION),
  state: z.literal("degraded"),
  reasonCode: z.literal("GRAPH_V2_UNAVAILABLE"),
  retryable: z.literal(false),
  action: z.literal("none"),
  warnings: z.tuple([z.literal("GRAPH_V2_UNAVAILABLE")]),
})

export const GraphV2RolloutStateSchema = z.discriminatedUnion("enabled", [
  z.strictObject({ enabled: z.literal(true) }),
  z.strictObject({
    enabled: z.literal(false),
    unavailable: GraphV2UnavailableStateSchema,
  }),
])

export type GraphV2UnavailableState = z.infer<typeof GraphV2UnavailableStateSchema>
export type GraphV2RolloutState = z.infer<typeof GraphV2RolloutStateSchema>

/** The server flag is enabled only by the exact, case-sensitive value `true`. */
export function graphV2RolloutState(rawValue: string | undefined = process.env[GRAPH_V2_ENABLED_ENV_VAR]): GraphV2RolloutState {
  if (rawValue === "true") return { enabled: true }

  return {
    enabled: false,
    unavailable: {
      contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
      state: "degraded",
      reasonCode: "GRAPH_V2_UNAVAILABLE",
      retryable: false,
      action: "none",
      warnings: ["GRAPH_V2_UNAVAILABLE"],
    },
  }
}

export function isGraphV2Enabled(rawValue?: string): boolean {
  return graphV2RolloutState(rawValue).enabled
}
