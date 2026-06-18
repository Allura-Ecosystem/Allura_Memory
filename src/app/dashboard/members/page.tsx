import type { Metadata } from "next"
import type React from "react"
import MembersClient from "./members-client"

export const metadata: Metadata = {
  title: "Members — Allura Memory",
}

export const dynamic = "force-dynamic"

export default function MembersPage(): React.ReactElement {
  return <MembersClient />
}
