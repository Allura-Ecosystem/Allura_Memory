"use client"

import type { Metadata } from "next"
import type { ReactNode } from "react"

import { EnvironmentBadge } from "@/components/memory-space/EnvironmentBadge"

export const metadata: Metadata = {
  title: "Memory Space",
}

export default function MemorySpaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden bg-[var(--dashboard-surface-alt)]">
      {/* Top bar with env badge + title */}
      <header className="flex items-center justify-between border-b border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-4 py-2">
        <h1 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">
          Memory Space
        </h1>
        <EnvironmentBadge />
      </header>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
