"use client"

/**
 * Environment Badge
 *
 * Displays whether this is the canonical product dashboard (3100)
 * or a dev preview (4310+).
 *
 * Rule: Badge must always be visible so no one confuses
 * dev preview with canonical product evidence.
 */

export function EnvironmentBadge() {
  const port = typeof window !== "undefined" ? window.location.port : ""
  const isDev = port === "4310" || port.startsWith("43") || process.env.NODE_ENV === "development"

  if (isDev || port === "4310") {
    return (
      <span className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
        DEV PREVIEW :{port || "4310"}
      </span>
    )
  }

  return (
    <span className="rounded-md bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
      CANONICAL :{port || "3100"}
    </span>
  )
}
