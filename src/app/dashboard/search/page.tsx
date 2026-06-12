import type React from "react"
import type { Metadata } from "next"
import SearchPageClient from "./SearchPageClient"

export const metadata: Metadata = {
  title: "Search",
}

export default function SearchPage(): React.ReactElement {
  return <SearchPageClient />
}
