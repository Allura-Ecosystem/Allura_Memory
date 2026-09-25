import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const digitalBrainRoot = path.resolve(root, "src/lib/digital-brain")
const brainRouteRoot = path.resolve(root, "src/app/api/brain")

function runtimeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return runtimeFiles(absolute)
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [absolute]
      : []
  })
}

describe("Epic 30 protected-content cache authority", () => {
  it("forbids framework and process-local caches in Digital Brain runtime modules", () => {
    for (const file of runtimeFiles(digitalBrainRoot)) {
      const source = readFileSync(file, "utf8")
      expect(source, file).not.toMatch(/from\s+["']next\/cache["']/)
      expect(source, file).not.toMatch(/\bunstable_cache\b/)
      expect(source, file).not.toMatch(/import\s*\{[^}]*\bcache\b[^}]*\}\s*from\s*["']react["']/s)
      expect(source, file).not.toMatch(/\b(?:new\s+)?(?:Map|WeakMap)\s*</)
    }
  })

  it("keeps every Brain API route dynamic and every explicit response non-cacheable", () => {
    const routeFiles = runtimeFiles(brainRouteRoot).filter((file) => file.endsWith(`${path.sep}route.ts`))
    expect(routeFiles.length).toBeGreaterThan(0)
    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8")
      expect(source, file).toContain('export const dynamic = "force-dynamic"')
      const responseCount = (source.match(/NextResponse\.json\s*\(/g) ?? []).length
      const noStoreCount = (source.match(/["']Cache-Control["']\s*:\s*["']no-store["']/g) ?? []).length
      expect(responseCount, file).toBeGreaterThan(0)
      expect(noStoreCount, file).toBe(responseCount)
    }
  })

  it("keeps the authenticated dashboard server-rendered per request", () => {
    const source = readFileSync(path.resolve(root, "src/app/dashboard/page.tsx"), "utf8")
    expect(source).toContain('export const dynamic = "force-dynamic"')
    expect(source).not.toMatch(/from\s+["']next\/cache["']/)
    expect(source).not.toMatch(/\bunstable_cache\b/)
  })
})
