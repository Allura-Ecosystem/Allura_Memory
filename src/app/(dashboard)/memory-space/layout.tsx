import type { Metadata } from "next"
import type { ReactNode } from "react"

import { EnvironmentBadge } from "@/components/memory-space/EnvironmentBadge"

export const metadata: Metadata = {
  title: "Memory Space",
}

export default function MemorySpaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[var(--allura-charcoal)]">
      {/* Top bar with env badge + title */}
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3">
        <h1
          className="font-display text-lg font-bold tracking-tight"
          style={{ fontFamily: "var(--font-family-display)", color: "var(--allura-white)" }}
        >
          Allura Memory Space
        </h1>
        <EnvironmentBadge />
      </header>

      {/* Main content: 3D canvas + side panel */}
      {children}
    </div>
  )
}
