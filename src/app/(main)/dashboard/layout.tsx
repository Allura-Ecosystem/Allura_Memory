import type { ReactNode } from "react"

import { getDevUserSync } from "@/lib/auth/dev-auth"
import { NodeStoreProvider } from "@/stores/node/node-store-provider"
import { SearchStoreProvider } from "@/stores/search/search-store-provider"
import { DashboardMobileNav, GovernanceSidebar } from "./_components/governance-sidebar"

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const user = getDevUserSync()

  return (
    <div className="flex min-h-screen bg-[var(--dashboard-bg)]">
      <GovernanceSidebar user={user} />
      <NodeStoreProvider>
        <SearchStoreProvider>
          <div className="min-w-0 flex-1">
            <DashboardMobileNav user={user} />
            <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        </SearchStoreProvider>
      </NodeStoreProvider>
    </div>
  )
}
