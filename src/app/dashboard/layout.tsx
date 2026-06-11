import type { Metadata } from "next"
import type { ReactNode } from "react"

import Sidebar from "@/components/allura/sidebar"
import { CommandPalette } from "@/components/dashboard/command-palette"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { ThemeProvider } from "@/components/dashboard/theme-provider"
import { ToastContainer } from "@/components/toast/ToastContainer"

export const metadata: Metadata = {
  title: {
    template: "%s | Allura Memory",
    default: "Dashboard | Allura Memory",
  },
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="dashboard-shell">
        <Sidebar />
        <main className="dashboard-main">{children}</main>
        <ToastContainer />
        <CommandPalette />
      </div>
      <MobileNav />
    </ThemeProvider>
  )
}
