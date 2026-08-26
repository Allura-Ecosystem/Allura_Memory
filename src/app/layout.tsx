import type { Metadata } from "next"
import type { ReactNode } from "react"

import { APP_CONFIG } from "@/config/app-config"
import { isClerkEnabled } from "@/lib/auth/config"
import { ClerkProviderShell } from "./clerk-provider"

import "./globals.css"

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const clerkEnabled = isClerkEnabled()
  const content = clerkEnabled ? <ClerkProviderShell>{children}</ClerkProviderShell> : children

  return (
    <html lang="en">
      <head>
        {/* FOCT prevention: apply stored theme before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('allura-theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.setAttribute('data-theme','dark')})()`,
          }}
        />
      </head>
      <body>{content}</body>
    </html>
  )
}
