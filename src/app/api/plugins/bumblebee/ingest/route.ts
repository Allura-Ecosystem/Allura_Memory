if (typeof window !== "undefined") throw new Error("server-side only")

import {
  authenticateBumblebeeRequest,
  authenticateIngestLease,
  createProductionIngest,
  createScopedIngestStore,
} from "@/lib/bumblebee/lease-repository"
import { createIngestHandler } from "@/lib/bumblebee/lease-routes"

export const POST = createIngestHandler({
  authenticate: authenticateBumblebeeRequest,
  ingest: createProductionIngest({
    authenticateLease: authenticateIngestLease,
    createScopedStore: createScopedIngestStore,
  }),
})
