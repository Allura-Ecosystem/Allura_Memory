import { headers } from "next/headers"

import type { DashboardFreshnessStatus, DashboardSource } from "./types"

export type DashboardEndpointProbe = {
  label: string
  endpoint: string
  statusCode: number | null
  ok: boolean
  degraded: boolean
  freshness: DashboardFreshnessStatus
  message: string
  observedAt: string
  source: DashboardSource
}

export async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers()
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http"
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000"

  return `${protocol}://${host}`
}

export async function probeDashboardEndpoint({
  endpoint,
  label,
  timeoutMs = 3500,
  source,
}: {
  endpoint: string
  label: string
  timeoutMs?: number
  source: DashboardSource
}): Promise<DashboardEndpointProbe> {
  const observedAt = new Date().toISOString()

  try {
    const origin = await getRequestOrigin()
    const response = await fetch(new URL(endpoint, origin), {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    return {
      label,
      endpoint,
      statusCode: response.status,
      ok: response.ok,
      degraded: !response.ok,
      freshness: response.ok ? "fresh" : "unknown",
      message: response.ok
        ? `Connected to ${endpoint}.`
        : `Endpoint responded with HTTP ${response.status}; surface must stay degraded until resolved.`,
      observedAt,
      source,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      label,
      endpoint,
      statusCode: null,
      ok: false,
      degraded: true,
      freshness: "unknown",
      message: `Endpoint probe failed: ${message}`,
      observedAt,
      source,
    }
  }
}
