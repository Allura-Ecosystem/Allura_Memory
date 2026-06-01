import { DashboardPlaceholder } from "@/components/dashboard/shell"
import { getDashboardRouteContract } from "@/lib/dashboard"

export default function DashboardCuratorPage() {
  return <DashboardPlaceholder route={getDashboardRouteContract("curator")} />
}
