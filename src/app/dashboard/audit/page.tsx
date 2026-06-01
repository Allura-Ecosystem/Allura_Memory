import { DashboardPlaceholder } from "@/components/dashboard/shell"
import { getDashboardRouteContract } from "@/lib/dashboard"

export default function DashboardAuditPage() {
  return <DashboardPlaceholder route={getDashboardRouteContract("audit")} />
}
