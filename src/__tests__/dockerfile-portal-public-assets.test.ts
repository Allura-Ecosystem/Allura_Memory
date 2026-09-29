import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Regression guard for the founder-candidate portal build.
 *
 * Root cause: the Next.js standalone runner stage in Dockerfile.portal only
 * copied `.next/standalone` and `.next/static`. Next.js standalone output
 * does NOT include `public/` (see Next.js docs on `output: "standalone"`),
 * so `/brand/allura-wordmark-runtime.png` (referenced by
 * `src/components/dashboard/dashboard-shell.tsx`) 404s in the built
 * container even though it renders fine under `next dev`/`next start`.
 */
describe("Dockerfile.portal runner stage", () => {
  it("copies the public/ directory into the runner image", async () => {
    const dockerfile = await readFile(join(process.cwd(), "Dockerfile.portal"), "utf8")

    const runnerStageStart = dockerfile.indexOf("AS runner")
    expect(runnerStageStart, "Dockerfile.portal should declare a runner stage").toBeGreaterThan(-1)
    const runnerStage = dockerfile.slice(runnerStageStart)

    expect(
      runnerStage,
      "runner stage should copy the builder's public/ directory so brand assets (e.g. /brand/allura-wordmark-runtime.png) resolve in the built container",
    ).toMatch(/COPY\s+--from=builder\s+\/app\/public\s+\.\/public/)
  })

  it("still copies the standalone server and static assets", async () => {
    const dockerfile = await readFile(join(process.cwd(), "Dockerfile.portal"), "utf8")
    expect(dockerfile).toMatch(/COPY\s+--from=builder\s+\/app\/\.next\/standalone\s+\.\//)
    expect(dockerfile).toMatch(/COPY\s+--from=builder\s+\/app\/\.next\/static\s+\.\/\.next\/static/)
  })
})
