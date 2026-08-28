if (typeof window !== "undefined") throw new Error("server-side only")

import { persistIngestBatch } from "@/lib/bumblebee/ingest-repository"
import { authenticateBumblebeeRequest } from "@/lib/bumblebee/lease-repository"
import { createIngestHandler } from "@/lib/bumblebee/lease-routes"

export const POST = createIngestHandler({ authenticate: authenticateBumblebeeRequest, persist: persistIngestBatch })
