/**
 * Example Process Definition — Story 12.5
 * Validates the headless CLI works end-to-end.
 *
 * Run:
 *   bun run process:run scripts/processes/example-process.ts --group-id allura-system
 *   bun run process:run scripts/processes/example-process.ts --dry-run
 */

import { defineProcess, step, gate } from "../../src/lib/process-engine"

export default defineProcess("example-validation", {
  name: "Example Validation Process",
  group_id: "allura-system",
  steps: [
    step("check-env", "Verify environment", async () => {
      return { nodeVersion: process.version, platform: process.platform }
    }),
    gate("has-group-id", "Verify group_id is allura-namespaced", async (ctx) => {
      return ctx.groupId.startsWith("allura-")
    }),
    step("report", "Generate report", async (ctx) => {
      return {
        previousResults: ctx.stepResults,
        timestamp: new Date().toISOString(),
      }
    }),
  ],
})
