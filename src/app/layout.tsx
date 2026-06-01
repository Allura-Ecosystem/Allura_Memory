import type { Metadata } from "next"
import type { ReactNode } from "react"

import { APP_CONFIG } from "@/config/app-config"

import "./globals.css"

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
