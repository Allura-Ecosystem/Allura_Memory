import type { Metadata } from "next"

import { MissionControlRouteShell } from "@/app/(main)/_components/mission-control-route-shell"

export const metadata: Metadata = {
  title: "Mission Control Agents",
  description: "Agent runtime route shell backed by adapter declarations.",
}

export default function AgentsPage() {
  return (
    <MissionControlRouteShell
      route="/agents"
      eyebrow="Mission Control route parity"
      title="Agents are declared as runtime-backed, not simulated truth."
      summary="This route distinguishes real Team RAM, native subagents, and external runtime agents from placeholder chat surfaces."
      liveState="The existing chat surface remains available as a placeholder, but this route does not claim simulated responses as runtime evidence."
      nextEvidence={[
        "Connect runtime agent inventory to the canonical agent manifest and run traces.",
        "Label placeholder or simulated interactions as non-authoritative.",
        "Capture authenticated agent-route smoke evidence before the 3100 cutover.",
      ]}
      tone="agent"
      secondaryHref="/agents/chat"
      secondaryLabel="Open placeholder chat"
    />
  )
}
