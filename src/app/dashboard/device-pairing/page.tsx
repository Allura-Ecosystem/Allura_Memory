import { redirect } from "next/navigation"

import { DashboardDevicePairingApproval } from "@/components/device-pairing/dashboard-device-pairing-approval"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"

export const dynamic = "force-dynamic"

type DevicePairingSearchParams = {
  txn?: string
  state?: string
}

export default async function DevicePairingPage({
  searchParams,
}: {
  searchParams: Promise<DevicePairingSearchParams> | DevicePairingSearchParams
}) {
  const { user } = await requireDashboardScope("/dashboard/device-pairing")
  const { txn, state } = await searchParams

  if (
    typeof txn !== "string" ||
    txn.trim().length === 0 ||
    typeof state !== "string" ||
    state.trim().length === 0
  ) {
    redirect("/dashboard")
  }

  return (
    <DashboardShell user={user} title="Device pairing">
      <DashboardDevicePairingApproval
        enrollment_transaction_id={txn}
        pkce_state={state}
      />
    </DashboardShell>
  )
}
