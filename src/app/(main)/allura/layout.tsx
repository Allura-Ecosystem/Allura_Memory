import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: {
    absolute: "Allura Brain — Mission Control",
  },
  description: "Governed memory command center for memories, insights, traces, provenance, and HITL approvals.",
}

export default function AlluraLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--dashboard-bg)]">
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}
