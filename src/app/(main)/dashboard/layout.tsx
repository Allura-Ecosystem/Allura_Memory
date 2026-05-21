import type { ReactNode } from "react"

import { NodeStoreProvider } from "@/stores/node/node-store-provider"
import { SearchStoreProvider } from "@/stores/search/search-store-provider"

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-[var(--dashboard-bg)]">
      {/* Minimal nav placeholder — will be replaced with thin workflow nav per spec v2 */}
      <nav className="sticky top-0 z-20 flex h-14 items-center border-b border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]/95 px-4 backdrop-blur">
        <span className="text-sm font-semibold text-[var(--dashboard-text-primary)]">Allura</span>
      </nav>
      <NodeStoreProvider>
        <SearchStoreProvider>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </SearchStoreProvider>
      </NodeStoreProvider>
    </div>
  )
}
