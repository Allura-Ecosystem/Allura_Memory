import { notFound } from "next/navigation"

import { DashboardPlaceholder } from "@/components/dashboard/shell"
import { getDashboardRouteContractByPath } from "@/lib/dashboard"

export default async function DashboardDynamicRoutePage({
  params,
}: {
  params: Promise<{ route: string }>
}) {
  const { route } = await params

  try {
    return <DashboardPlaceholder route={getDashboardRouteContractByPath(`/dashboard/${route}`)} />
  } catch {
    notFound()
  }
}
