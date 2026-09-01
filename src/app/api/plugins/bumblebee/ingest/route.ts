if (typeof window !== "undefined") throw new Error("server-side only")

import {
  authenticateBumblebeeRequest,
  authenticateIngestLease,
  createProductionIngest,
  createScopedIngestStore,
} from "@/lib/bumblebee/lease-repository"
import { createIngestHandler } from "@/lib/bumblebee/lease-routes"

// AC-6/AC-7: production ingestion is HTTPS-only with explicit trusted-proxy
// scheme handling. This check fails CLOSED: an absent or unproven scheme
// signal is rejected, never silently accepted. Exactly three ways to pass:
//
//   1. The request's own URL scheme is https:. This is a signal the caller
//      does not control (it reflects how Next.js actually received the
//      connection), unlike a header.
//   2. BUMBLEBEE_TRUST_PROXY=true is set (an operator has explicitly
//      declared a TLS-terminating proxy trustworthy) AND
//      x-forwarded-proto: https is present. The header is caller-controlled
//      input and is NEVER sufficient on its own -- without the trust flag
//      an attacker-supplied "x-forwarded-proto: https" is rejected exactly
//      like a stripped/absent header.
//   3. BUMBLEBEE_ALLOW_LOOPBACK_INGEST=true is set AND the request is
//      actually addressed to a loopback host (localhost/127.0.0.1/::1).
//      This is the isolated local-test escape hatch; it is explicitly
//      gated on both the env flag and the real hostname, never implicit.
// WHATWG URL.hostname renders IPv6 literals with their brackets intact
// (e.g. "[::1]"), so the bracketed form is the value actually compared.
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"])

function isLoopbackRequest(request: Request): boolean {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(request.url).hostname)
  } catch {
    return false
  }
}

export function enforceHttps(request: Request): void {
  if (process.env.NODE_ENV !== "production") return

  const url = new URL(request.url)
  if (url.protocol === "https:") return

  const trustProxy = process.env.BUMBLEBEE_TRUST_PROXY === "true"
  const forwardedProto = request.headers.get("x-forwarded-proto")
  if (trustProxy && forwardedProto === "https") return

  const loopbackTestOverride = process.env.BUMBLEBEE_ALLOW_LOOPBACK_INGEST === "true"
  if (loopbackTestOverride && isLoopbackRequest(request)) return

  throw new Error("BUMBLEBEE_INGEST_HTTPS_REQUIRED")
}

export const POST = createIngestHandler({
  authenticate: authenticateBumblebeeRequest,
  ingest: createProductionIngest({
    authenticateLease: authenticateIngestLease,
    createScopedStore: createScopedIngestStore,
    prePipeline: enforceHttps,
  }),
})
