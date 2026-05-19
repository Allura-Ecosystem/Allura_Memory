import type { Metadata } from "next"

import { MissionControlRouteShell } from "@/app/(main)/_components/mission-control-route-shell"

export const metadata: Metadata = {
  title: "Mission Control Work Board",
  description: "Notion work-board route shell backed by adapter declarations.",
}

export default function WorkBoardPage() {
  return (
    <MissionControlRouteShell
      route="/work-board"
      eyebrow="Mission Control route parity"
      title="Work Board is declared as Notion-backed planning truth."
      summary="This route protects Notion as the planning source of truth and avoids creating a competing local planning database."
      liveState="Notion board rows are not mirrored into this route yet. The shell shows the adapter policy and keeps live planning data out until the Notion adapter is attached."
      nextEvidence={[
        "Fetch epic, status, owner, acceptance criteria, reviewers, validation command, and evidence expectation from Notion.",
        "Prove write actions require Captain-approved policy and audit receipts.",
        "Attach Notion route smoke evidence to the Phase 4 cutover packet.",
      ]}
      tone="work"
    />
  )
}
