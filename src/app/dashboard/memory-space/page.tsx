import { DashboardPlaceholder } from "@/components/dashboard/shell"
import { getDashboardRouteContract } from "@/lib/dashboard"

export default function DashboardMemorySpacePage() {
  return <DashboardPlaceholder route={getDashboardRouteContract("memory-space")} />
}
