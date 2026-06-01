import { DashboardPlaceholder } from "@/components/dashboard/shell"
import { getDashboardRouteContract } from "@/lib/dashboard"

export default function DashboardSettingsPage() {
  return <DashboardPlaceholder route={getDashboardRouteContract("settings")} />
}
