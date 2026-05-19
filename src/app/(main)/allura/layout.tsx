import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: {
    absolute: "Governed memory command center",
  },
  description: "Allura's governed memory command center for reviewing traceable, degraded-aware memory state.",
}

export default function AlluraLayout({ children }: { children: ReactNode }) {
  return children
}
