import type { Metadata } from "next"

import { MissionControlRouteShell } from "@/app/(main)/_components/mission-control-route-shell"

export const metadata: Metadata = {
  title: "Mission Control Command",
  description: "Aggregated Mission Control route shell backed by adapter declarations.",
}

export default function CommandPage() {
  return (
    <MissionControlRouteShell
      route="/command"
      eyebrow="Mission Control route parity"
      title="Command overview is declared and visible."
      summary="This route is the read-only cockpit overview for adapter summaries. It proves route coverage without pretending every downstream source is cut over."
      liveState="Adapter summaries are not yet wired to live upstream data in this slice. The page shows the governing adapter contract and keeps the route degraded honestly until Phase 4 validation closes."
      nextEvidence={[
        "Connect adapter summary cards to declared route data.",
        "Capture authenticated and unauthenticated smoke output.",
        "Attach route screenshots to the Phase 4 cutover evidence packet.",
      ]}
      tone="command"
    />
  )
}
