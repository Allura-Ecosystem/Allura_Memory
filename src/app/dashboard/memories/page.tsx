import { DashboardPlaceholder } from "@/components/dashboard/shell"
import { getDashboardRouteContract } from "@/lib/dashboard"

export default function DashboardMemoriesPage() {
  return <DashboardPlaceholder route={getDashboardRouteContract("memories")} />
}
