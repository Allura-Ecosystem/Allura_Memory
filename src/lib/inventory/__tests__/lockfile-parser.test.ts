/**
 * Bumblebee Guard -- bun.lock parser.
 *
 * Uses both a small hand-written fixture (deterministic edge cases) and
 * this repo's own real bun.lock (a genuine, current, ~1400-package
 * lockfile) to prove the parser works against real data, not just an
 * invented shape.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"
import { parseBunLock } from "../lockfile-parser"

const FIXTURE = `{
  "lockfileVersion": 1,
  "configVersion": 0,
  "workspaces": {},
  "packages": {
    "@allura/cli": ["@allura/cli@workspace:packages/cli"],
    "lodash": ["lodash@4.17.23", "", {}, "sha512-LgVTMpQtIopCi79SJeDiP0TfWi5CNEc/L/aRdTh3yIvmZXTnheWpKjSZhnvMl8iXbC1tFg9gdHHDMLoV7CnG+w=="],
    "@babel/core": ["@babel/core@7.29.0", "", { "dependencies": {} }, "sha512-CGOfOJqWjg2qW/Mb6zNsDm+u5vFQ8DxXfbM09z69p5Z6+mE1ikP2jUXw+j42Pf1XTYED2Rni5f95npYeuwMDQA=="],
    "no-hash-pkg": ["no-hash-pkg@1.0.0", "", {}],
  },
}`

describe("Story 26.2 Guard — parseBunLock (fixture)", () => {
  it("parses a scoped and unscoped package with correct name/version/hash", () => {
    const records = parseBunLock(FIXTURE)
    const lodash = records.find((r) => r.package === "lodash")
    const babel = records.find((r) => r.package === "@babel/core")

    expect(lodash).toMatchObject({ package: "lodash", version: "4.17.23", ecosystem: "npm" })
    expect(lodash!.hash).toContain("sha512-")
    expect(babel).toMatchObject({ package: "@babel/core", version: "7.29.0" })
  })

  it("skips workspace-internal packages (no external version/hash)", () => {
    const records = parseBunLock(FIXTURE)
    expect(records.find((r) => r.package === "@allura/cli")).toBeUndefined()
  })

  it("skips an entry with no integrity hash rather than fabricating one", () => {
    const records = parseBunLock(FIXTURE)
    expect(records.find((r) => r.package === "no-hash-pkg")).toBeUndefined()
  })

  it("produces a stable, deterministic id for the same package/version", () => {
    const records = parseBunLock(FIXTURE)
    const lodash = records.find((r) => r.package === "lodash")
    expect(lodash!.id).toBe("bunlock:lodash@4.17.23")
  })

  it("marks every record artifact_type=lockfile, trust_state=verified, freshness_state=fresh", () => {
    const records = parseBunLock(FIXTURE)
    for (const record of records) {
      expect(record.artifact_type).toBe("lockfile")
      expect(record.trust_state).toBe("verified")
      expect(record.freshness_state).toBe("fresh")
    }
  })

  it("returns [] for content that is not valid JSON5", () => {
    expect(parseBunLock("{ this is not json at all ///")).toEqual([])
  })

  it("returns [] for valid JSON5 with no packages key", () => {
    expect(parseBunLock('{ "lockfileVersion": 1 }')).toEqual([])
  })
})

describe("Story 26.2 Guard — parseBunLock (this repo's real bun.lock)", () => {
  it("parses this repo's actual lockfile without throwing, producing real records", () => {
    const realLockfile = readFileSync(resolve(process.cwd(), "bun.lock"), "utf8")
    const records = parseBunLock(realLockfile)

    expect(records.length).toBeGreaterThan(500) // this repo has 1000+ real dependencies
    expect(records.every((r) => r.package.length > 0 && r.version.length > 0 && r.hash.length > 0)).toBe(true)

    // every id must be unique -- no duplicate (group_id, workspace_id, id) collisions
    const ids = records.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("finds this repo's own known direct dependency (zod) at a real version", () => {
    const realLockfile = readFileSync(resolve(process.cwd(), "bun.lock"), "utf8")
    const records = parseBunLock(realLockfile)
    const zod = records.find((r) => r.package === "zod")
    expect(zod).toBeDefined()
    expect(zod!.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
