import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createDefaultRegistry, getAdapterByRoute } from "@/lib/adapter-registry/registry"

const requiredRoutes = [
  { route: "/command", file: "src/app/(main)/command/page.tsx" },
  { route: "/work-board", file: "src/app/(main)/work-board/page.tsx" },
  { route: "/agents", file: "src/app/agents/page.tsx" },
  { route: "/telemetry", file: "src/app/(main)/telemetry/page.tsx" },
  { route: "/allura", file: "src/app/(main)/allura/page.tsx" },
  { route: "/resources", file: "src/app/(main)/resources/page.tsx" },
] as const

describe("Mission Control route parity", () => {
  it("has an app route file for every required cutover route", () => {
    for (const entry of requiredRoutes) {
      expect(existsSync(join(process.cwd(), entry.file)), `${entry.route} should map to ${entry.file}`).toBe(true)
    }
  })

  it("has an adapter declaration for every required cutover route", () => {
    const registry = createDefaultRegistry()

    for (const entry of requiredRoutes) {
      const adapter = getAdapterByRoute(registry, entry.route)
      expect(adapter, `${entry.route} should have adapter declaration`).not.toBeNull()
      expect(adapter?.route).toBe(entry.route)
      expect(adapter?.read_policy.type).toBe("authenticated")
      expect(adapter?.write_policy.type).toBe("authenticated")
    }
  })
})
