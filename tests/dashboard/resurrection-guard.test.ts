import { describe, expect, it } from "vitest"
import { existsSync } from "fs"
import { resolve } from "path"

/**
 * Dashboard Resurrection Guard
 * Fails if old dashboard components are reintroduced.
 * Created: 2026-05-21 by Troy Curator
 * Source: memory/2026-05-20.md kill list
 */

describe("Dashboard Resurrection Guard", () => {
  const repoRoot = resolve(__dirname, "../../..")

  it("must not have old dashboard component directory", () => {
    const forbidden = resolve(repoRoot, "src/components/dashboard")
    expect(existsSync(forbidden)).toBe(false)
  })

  it("must not have old sidebar directory", () => {
    const forbidden = resolve(repoRoot, "src/app/(main)/dashboard/_components/sidebar")
    expect(existsSync(forbidden)).toBe(false)
  })

  it("must not have old top-nav-bar component", () => {
    const forbidden = resolve(repoRoot, "src/app/(main)/dashboard/_components/top-nav-bar.tsx")
    expect(existsSync(forbidden)).toBe(false)
  })

  // Note: The CI guard script (.github/scripts/dashboard-guard.sh) handles
  // forbidden imports and strings. This test covers structural resurrection.
})
