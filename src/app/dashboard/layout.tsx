import type { Metadata } from "next"
import type { ReactNode } from "react"

import Sidebar from "@/components/allura/sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { CommandPalette } from "@/components/dashboard/command-palette"
import { InspectorPanel } from "@/components/dashboard/inspector-panel"
import { InspectorProvider } from "@/components/dashboard/inspector-context"
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
      <InspectorProvider>
        {/* Full-height flex shell: sidebar left, content right */}
        <div className="dashboard-shell">
          <Sidebar />
          {/* Main column: header + scrollable content */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <DashboardHeader />
            <main
              className="scry"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              {children}
            </main>
          </div>
          <ToastContainer />
          <CommandPalette />
        </div>
        <MobileNav />
        <InspectorPanel />
      </InspectorProvider>
    </ThemeProvider>
  )
}
