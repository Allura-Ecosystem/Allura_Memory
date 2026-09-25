import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const routeRoot = path.resolve(process.cwd(), "src/app/api/memory")

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry)
    return statSync(target).isDirectory() ? routeFiles(target) : entry === "route.ts" ? [target] : []
  })
}

describe("protected memory route database boundary", () => {
  it("does not permit direct owner-pool access in any memory route", () => {
    const violations = routeFiles(routeRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8")
      return /\bget(?:Owner)?Pool\s*\(/.test(source) || /postgres\/connection/.test(source)
        ? [path.relative(process.cwd(), file)]
        : []
    })
    expect(violations).toEqual([])
  })
})
