import type { Metadata } from "next"
import type { ReactNode } from "react"
import { headers } from "next/headers"

import Sidebar from "@/components/allura/sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { CommandPalette } from "@/components/dashboard/command-palette"
import { InspectorPanel } from "@/components/dashboard/inspector-panel"
import { InspectorProvider } from "@/components/dashboard/inspector-context"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { ThemeProvider } from "@/components/dashboard/theme-provider"
import { ToastContainer } from "@/components/toast/ToastContainer"
import { getHeaderState } from "@/lib/operational-state/sources/header-source"
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id"

export const metadata: Metadata = {
  title: {
    template: "%s | Allura Memory",
    default: "Dashboard | Allura Memory",
  },
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const headersList = await headers()
  const rawGroupId = headersList.get("x-allura-group-id") ?? "allura-system"
  let groupId = "allura-system"
  try {
    groupId = validateGroupId(rawGroupId)
  } catch (e) {
    if (!(e instanceof GroupIdValidationError)) throw e
  }
  const header = await getHeaderState(groupId)

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
            <DashboardHeader
              orgName={header.orgName}
              sourceName={header.sourceName}
              sourceFresh={header.sourceFresh}
              sourceFreshness={header.sourceFreshness}
              receiptCount={header.receiptCount}
            />
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
