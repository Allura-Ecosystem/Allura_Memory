/**
 * Hardened outbound fetch for Story 26.4 Slice B.
 *
 * This is the one place in the codebase that makes real network calls to
 * third-party advisory feeds. Everything downstream treats the response as
 * hostile: real GitHub Security Advisories and OSV.dev advisories were
 * confirmed (2026-08-27) to embed raw, attacker-shaped HTML and exploit
 * source code directly in free-text summary/description fields -- this is
 * not a hypothetical risk.
 *
 * Guarantees:
 * - Fixed host allowlist, HTTPS only. No caller-supplied URL is ever
 *   constructed from advisory content -- only from this module's own
 *   ALLOWED_HOSTS constants and caller-supplied package/version strings that
 *   are validated before being placed in a URL or JSON body.
 * - Explicit timeout (AbortController) -- a slow/hanging feed cannot stall
 *   the discovery cycle indefinitely.
 * - Response size cap -- a malicious or misbehaving feed cannot exhaust
 *   memory with an oversized response.
 * - JSON-only. Never returns raw text/HTML to a caller.
 */

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export const ALLOWED_HOSTS = [
  "api.osv.dev",
  "api.github.com",
  "registry.npmjs.org",
] as const

export type AllowedHost = (typeof ALLOWED_HOSTS)[number]

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024 // 5 MiB

export class SafeFetchError extends Error {}

function assertAllowedUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SafeFetchError(`malformed URL: ${url}`)
  }
  if (parsed.protocol !== "https:") {
    throw new SafeFetchError(`only https is permitted, got ${parsed.protocol} for ${url}`)
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname as AllowedHost)) {
    throw new SafeFetchError(`host not on the approved allowlist: ${parsed.hostname}`)
  }
  return parsed
}

export interface SafeFetchOptions {
  method?: "GET" | "POST"
  body?: unknown
  timeoutMs?: number
  headers?: Record<string, string>
}

/**
 * Fetch JSON from an allowlisted host only. Throws SafeFetchError for any
 * disallowed host/protocol, a timeout, an oversized response, or a
 * non-2xx/non-JSON response. Never returns raw text to the caller.
 */
export async function safeFetchJson(url: string, options: SafeFetchOptions = {}): Promise<unknown> {
  const parsed = assertAllowedUrl(url)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(parsed.toString(), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "allura-bumblebee-threat-discovery/1.0 (+https://github.com/Allura-Ecosystem/Allura_Memory)",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      redirect: "error", // a redirect to an unapproved host must never be followed silently
    })

    if (!response.ok) {
      throw new SafeFetchError(`${parsed.hostname} responded ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get("content-length")
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new SafeFetchError(`${parsed.hostname} response exceeds ${MAX_RESPONSE_BYTES} bytes (declared: ${contentLength})`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new SafeFetchError(`${parsed.hostname} returned no readable body`)
    }

    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new SafeFetchError(`${parsed.hostname} response exceeded ${MAX_RESPONSE_BYTES} bytes while streaming`)
      }
      chunks.push(value)
    }

    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8")
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new SafeFetchError(`${parsed.hostname} did not return valid JSON`)
    }
  } catch (error) {
    if (error instanceof SafeFetchError) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new SafeFetchError(`${parsed.hostname} did not respond within ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)
    }
    throw new SafeFetchError(`${parsed.hostname} request failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Validate a package name / version string before it is placed into a URL
 * path segment or JSON body sent to an external host. Rejects anything that
 * is not a plausible package identifier -- this is the boundary that keeps
 * inventory data (already server-scoped, but still worth defending in
 * depth) from ever smuggling a header-injection or path-traversal payload
 * into an outbound request.
 */
export function assertSafeIdentifier(value: string, label: string): string {
  if (!value || value.length > 256) {
    throw new SafeFetchError(`${label} must be a non-empty string under 256 chars`)
  }
  if (!/^[a-zA-Z0-9._@/+-]+$/.test(value)) {
    throw new SafeFetchError(`${label} contains characters not permitted in an outbound request: ${value}`)
  }
  return value
}
