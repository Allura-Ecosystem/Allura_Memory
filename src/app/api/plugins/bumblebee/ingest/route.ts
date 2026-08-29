if (typeof window !== "undefined") throw new Error("server-side only")

import { authenticateBumblebeeRequest } from "@/lib/bumblebee/lease-repository"
import { createIngestHandler } from "@/lib/bumblebee/lease-routes"

// The DB-backed batch store (replay/conflict lookups and atomic persist) lands
// in the next slice; until it exists the route must keep refusing ingestion
// with 501 rather than accepting data it cannot durably store.
export const POST = createIngestHandler({
  authenticate: authenticateBumblebeeRequest,
  ingest: async () => Response.json({ error: "BUMBLEBEE_INGEST_NOT_IMPLEMENTED" }, { status: 501 }),
})