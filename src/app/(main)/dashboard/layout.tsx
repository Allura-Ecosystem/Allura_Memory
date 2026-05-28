import type { ReactNode } from "react"

import { NodeStoreProvider } from "@/stores/node/node-store-provider"
import { SearchStoreProvider } from "@/stores/search/search-store-provider"
import { Sidebar } from "./_components/sidebar"

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex h-screen bg-[var(--allura-cream)]">
      <div className="w-60 shrink-0 overflow-y-auto">
        <Sidebar />
      </div>
      <NodeStoreProvider>
        <SearchStoreProvider>
          <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
        </SearchStoreProvider>
      </NodeStoreProvider>
    </div>
  )
}
