if (typeof window !== "undefined") throw new Error("server-side only")

import { issueScanLease } from "@/lib/bumblebee/lease-authority"
import {
  authenticateBumblebeeRequest,
  authenticateRunnerForSource,
  persistScanLease,
} from "@/lib/bumblebee/lease-repository"
import { createRunsHandler } from "@/lib/bumblebee/lease-routes"

export const POST = createRunsHandler({
  authenticate: authenticateBumblebeeRequest,
  issue: (input) => issueScanLease(input, {
    authenticateRunner: authenticateRunnerForSource,
    persistLease: persistScanLease,
  }),
})
