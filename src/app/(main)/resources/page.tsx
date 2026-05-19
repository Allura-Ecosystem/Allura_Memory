import type { Metadata } from "next"

import { MissionControlRouteShell } from "@/app/(main)/_components/mission-control-route-shell"

export const metadata: Metadata = {
  title: "Mission Control Resources",
  description: "Resource manifest route shell backed by adapter declarations.",
}

export default function ResourcesPage() {
  return (
    <MissionControlRouteShell
      route="/resources"
      eyebrow="Mission Control route parity"
      title="Resources are declared as manifest-backed inventory."
      summary="This route is reserved for skills, agents, MCP servers, containers, cron jobs, and drift warnings from the Resource Manifest or generated manifest endpoint."
      liveState="No resource inventory is fabricated here. Until the manifest endpoint is attached, this route exposes only the adapter contract and required evidence path."
      nextEvidence={[
        "Declare the canonical Resource Manifest path or generated endpoint.",
        "Prove drift warnings are sourced from manifest data, not static cards.",
        "Capture runtime smoke and screenshot evidence after the manifest source is wired.",
      ]}
      tone="resource"
    />
  )
}
