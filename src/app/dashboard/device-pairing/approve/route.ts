import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import { getAppPool } from "@/lib/postgres/connection"
import { approveEnrollment } from "@/lib/device-pairing/approval-service"

export async function POST(request: Request): Promise<Response> {
  const { user } = await requireDashboardScope("/dashboard/device-pairing/approve")
  const formData = await request.formData()
  const txn = formData.get("txn")
  const state = formData.get("state")

  if (
    typeof txn !== "string" ||
    txn.trim().length === 0 ||
    typeof state !== "string" ||
    state.trim().length === 0
  ) {
    return new Response("Invalid approval request", { status: 400 })
  }

  const result = await approveEnrollment(getAppPool(), {
    enrollment_transaction_id: txn,
    pkce_state: state,
    authUser: user,
  })

  return Response.redirect(result.callback.url, 303)
}
