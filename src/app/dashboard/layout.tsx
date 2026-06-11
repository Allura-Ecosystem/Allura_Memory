import type { Metadata } from "next"
import type { ReactNode } from "react"

import Sidebar from "@/components/allura/sidebar"

export const metadata: Metadata = {
  title: {
    template: "%s | Allura Memory",
    default: "Dashboard | Allura Memory",
  },
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-shell">
      <Sidebar />
      <main className="dashboard-main">{children}</main>
    </div>
  )
}
