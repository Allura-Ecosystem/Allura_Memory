import { DashboardPlaceholder } from "@/components/dashboard/shell"
import { getDashboardRouteContract } from "@/lib/dashboard"

export default function DashboardGraphPage() {
  return <DashboardPlaceholder route={getDashboardRouteContract("graph")} />
}
