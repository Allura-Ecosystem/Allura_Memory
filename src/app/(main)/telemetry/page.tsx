import type { Metadata } from "next"

import { MissionControlRouteShell } from "@/app/(main)/_components/mission-control-route-shell"

export const metadata: Metadata = {
  title: "Mission Control Telemetry",
  description: "Telemetry route shell backed by adapter declarations.",
}

export default function TelemetryPage() {
  return (
    <MissionControlRouteShell
      route="/telemetry"
      eyebrow="Mission Control route parity"
      title="Telemetry is declared with degraded-state honesty."
      summary="This route is the future surface for model, prompt, tool, retry, rate-limit, failure, and degraded-state metrics."
      liveState="Live telemetry metrics are not claimed in this slice. Missing measurements must remain unknown or degraded until a telemetry adapter provides real data."
      nextEvidence={[
        "Wire model/tool/runtime metrics through the telemetry adapter.",
        "Prove missing metrics render as unknown or degraded.",
        "Capture health and smoke evidence before the 3100 cutover.",
      ]}
      tone="telemetry"
    />
  )
}
