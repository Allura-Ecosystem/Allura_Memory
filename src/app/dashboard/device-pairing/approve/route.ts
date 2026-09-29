import { unstable_rethrow } from "next/navigation"

import { PrincipalProviderUnavailableError } from "@/lib/auth/principal-errors"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import { getAppPool } from "@/lib/postgres/connection"
import { approveEnrollment } from "@/lib/device-pairing/approval-service"

export async function POST(request: Request): Promise<Response> {
  // A route handler has no error boundary to fall back to. An identity
  // provider that cannot be consulted is a degraded dependency, so answer 503
  // rather than letting the throw become an empty 500. Every other throw,
  // including the redirect signal for an absent principal, still propagates.
  let guarded: Awaited<ReturnType<typeof requireDashboardScope>>
  try {
    guarded = await requireDashboardScope("/dashboard/device-pairing/approve")
  } catch (error) {
    unstable_rethrow(error)
    if (!(error instanceof PrincipalProviderUnavailableError)) throw error
    return new Response("Approval temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    })
  }
  const { user } = guarded
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
