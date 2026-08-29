if (typeof window !== "undefined") throw new Error("server-side only")

import {
  authenticateBumblebeeRequest,
  authenticateIngestLease,
  createProductionIngest,
  createScopedIngestStore,
} from "@/lib/bumblebee/lease-repository"
import { createIngestHandler } from "@/lib/bumblebee/lease-routes"

// AC-7: production ingestion is HTTPS-only. Next.js behind a TLS-terminating
// proxy sets x-forwarded-proto; loopback dev bypasses the check so local
// test runs are not blocked.
function enforceHttps(request: Request): void {
  if (process.env.NODE_ENV === "production") {
    const proto = request.headers.get("x-forwarded-proto") ?? ""
    if (proto && proto !== "https") {
      throw new Error("BUMBLEBEE_INGEST_HTTPS_REQUIRED")
    }
  }
}

export const POST = createIngestHandler({
  authenticate: authenticateBumblebeeRequest,
  ingest: createProductionIngest({
    authenticateLease: authenticateIngestLease,
    createScopedStore: createScopedIngestStore,
    prePipeline: enforceHttps,
  }),
})
