import type { Metadata } from "next"

import { getExecutionOverview } from "@/server/actions/execution-view"
import { ExecutionClient } from "./_components/execution-client"

export const metadata: Metadata = {
  title: "Execution",
}

// Always render live — execution state must never be statically cached.
export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

export default async function ExecutionPage() {
  const initial = await getExecutionOverview(GROUP_ID)

  return (
    <div style={{ padding: "32px", maxWidth: "1200px" }}>
      <ExecutionClient initial={initial} groupId={GROUP_ID} />
    </div>
  )
}
