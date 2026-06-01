import { DashboardPlaceholder } from "@/components/dashboard/shell"
import { getDashboardRouteContract } from "@/lib/dashboard"

export default function DashboardGovernancePage() {
  return <DashboardPlaceholder route={getDashboardRouteContract("governance")} />
}
