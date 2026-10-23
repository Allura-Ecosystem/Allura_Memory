import { ESLint } from "eslint"
import { afterEach, describe, expect, it } from "vitest"

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { compileClassicScript, CONSUMER, EXPORTS, INVENTORY, PROJECT, validateConsumerReferences, validateGeneratedExports } from "./validate-generated-exports.mjs"

const repository = process.cwd()
const temporary: string[] = []
const digest = (text: string | Buffer) => createHash("sha256").update(text).digest("hex")
const write = (root: string, path: string, text: string | Buffer) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "allura-generated-guard-"))
  temporary.push(root)
  for (const file of [...EXPORTS, CONSUMER, INVENTORY, "docs/design/command-center/README.md", "scripts/ci/validate-generated-exports.mjs", "package.json"]) {
    write(root, file, readFileSync(join(repository, file)))
  }
  return root
}
function inventory(root: string) {
  return JSON.parse(readFileSync(join(root, INVENTORY), "utf8"))
}
function rehashConsumer(root: string, html: string) {
  write(root, CONSUMER, html)
  const data = inventory(root)
  data.consumer.sha256 = digest(html)
  write(root, INVENTORY, JSON.stringify(data))
}
function run(root: string, args: string[]) {
  return spawnSync("bun", ["run", ...args], {
    cwd: root, encoding: "utf8", timeout: 20000,
    env: { HOME: process.env.HOME, PATH: process.env.PATH, NODE_ENV: "test" },
  })
}
function processFixture() {
  const root = fixture()
  symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir")
  write(root, "eslint.config.mjs", 'export default [{files:["bad.js"],rules:{"no-undef":"error"}}]\n')
  write(root, "bad.js", "missingGlobal()\n")
  // The real package entrypoint must run the guard before even an empty/successful helper.
  write(root, "scripts/ci/lint-changed.sh", 'printf ran > helper-ran\nexit 0\n')
  return root
}
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("historical generated export integrity", () => {
  it("accepts the exact repository snapshots without executing their scripts", () => {
    const report = validateGeneratedExports(repository)
    expect(report.status).toBe("passed")
    expect(report.observed).toHaveLength(3)
    expect(report.observed.every(item => item.parsed)).toBe(true)
  })

  for (const mode of ["missing", "byte-mutation", "length", "hash", "empty", "duplicate", "third", "digest", "schema", "traversal", "wildcard", "directory", "absolute", "symlink-alias", "symlink-escape", "unlisted-js", "symlink-directory", "disclaimer", "consumer-digest"] as const) {
    it(`rejects ${mode} snapshot or inventory drift`, () => {
      const root = fixture()
      const data = inventory(root)
      if (mode === "missing") rmSync(join(root, EXPORTS[0]))
      if (mode === "byte-mutation") { const bytes = readFileSync(join(root, EXPORTS[0])); bytes[0] ^= 1; write(root, EXPORTS[0], bytes) }
      if (mode === "length") data.artifacts[0].bytes++
      if (mode === "hash") data.artifacts[0].sha256 = "0".repeat(64)
      if (mode === "empty") data.artifacts = []
      if (mode === "duplicate") data.artifacts[1] = data.artifacts[0]
      if (mode === "third") data.artifacts.push(data.artifacts[0])
      if (mode === "digest") data.artifacts[0].sha256 = "not-a-digest"
      if (mode === "schema") data.schema_version = 2
      if (mode === "traversal") data.artifacts[0].file = "../support.js"
      if (mode === "wildcard") data.artifacts[0].file = `${PROJECT}/**/*.js`
      if (mode === "directory") data.artifacts[0].file = PROJECT
      if (mode === "absolute") data.artifacts[0].file = join(root, EXPORTS[0])
      if (mode === "symlink-alias" || mode === "symlink-escape") {
        const target = mode === "symlink-alias" ? join(root, "alias.txt") : join(repository, EXPORTS[0])
        if (mode === "symlink-alias") writeFileSync(target, readFileSync(join(root, EXPORTS[0])))
        rmSync(join(root, EXPORTS[0])); symlinkSync(target, join(root, EXPORTS[0]))
      }
      if (mode === "unlisted-js") write(root, `${PROJECT}/unknown.min.js`, "void 0")
      if (mode === "symlink-directory") symlinkSync(join(repository, PROJECT), join(root, PROJECT, "alias"), "dir")
      if (mode === "disclaimer") write(root, "docs/design/command-center/README.md", "production ready")
      if (mode === "consumer-digest") write(root, CONSUMER, readFileSync(join(root, CONSUMER), "utf8") + " ")
      write(root, INVENTORY, JSON.stringify(data))
      const result = validateGeneratedExports(root)
      expect(result.status).toBe("failed")
      expect(result.errors.length).toBeGreaterThan(0)
    })
  }

  it("rejects malformed classic syntax even when the fixture digest matches", () => {
    const root = fixture(), text = "const = ;", data = inventory(root)
    write(root, EXPORTS[0], text)
    data.artifacts[0].bytes = Buffer.byteLength(text); data.artifacts[0].sha256 = digest(text)
    write(root, INVENTORY, JSON.stringify(data))
    expect(validateGeneratedExports(root).status).toBe("failed")
  })

  it("compiles without execution and rejects module-only syntax", () => {
    expect(() => compileClassicScript('throw new Error("must never run")', "fixture.js")).not.toThrow()
    expect(() => compileClassicScript("export const value = 1", "fixture.js")).toThrow()
  })

  for (const mode of ["missing", "duplicate", "order", "external", "query", "module", "extra-inline", "changed-inline", "base"] as const) {
    it(`rejects ${mode} consumer script drift`, () => {
      const root = fixture()
      let html = readFileSync(join(root, CONSUMER), "utf8")
      const script = '<script src="./support.js"></script>'
      if (mode === "missing") html = html.replace(script, "")
      if (mode === "duplicate") html = html.replace(script, script + script)
      if (mode === "order") html = html.replace(script, "") + script
      if (mode === "external") html = html.replace('./support.js', 'https://example.invalid/unknown.js')
      if (mode === "query") html = html.replace('./support.js', './support.js?new=1')
      if (mode === "module") html = html.replace(script, '<script type="module" src="./support.js"></script>')
      if (mode === "extra-inline") html += '<script>throw new Error("never run")</script>'
      if (mode === "changed-inline") {
        write(root, CONSUMER, html.replace("class Component extends DCLogic", "class Changed extends DCLogic"))
      } else {
        // Rehash fixtures to exercise reference checks independently of the outer integrity check.
        rehashConsumer(root, html)
      }
      if (mode === "base") rehashConsumer(root, html.replace("<head>", '<head><base href="https://example.invalid/">'))
      expect(validateGeneratedExports(root).status).toBe("failed")
    })
  }

  it("parses consumer HTML inertly without executing injected script", () => {
    expect(() => validateConsumerReferences('<script>throw new Error("executed")</script>')).toThrow("expected exactly three")
  })

  it("excludes only the known snapshots and still lints an unknown neighboring script", async () => {
    const eslint = new ESLint({ cwd: repository })
    for (const file of EXPORTS) expect(await eslint.isPathIgnored(file)).toBe(true)
    const unknown = `${PROJECT}/unknown.js`
    expect(await eslint.isPathIgnored(unknown)).toBe(false)
    const result = await eslint.lintText('true && console.log("probe")', { filePath: unknown })
    expect(result[0].messages).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "@typescript-eslint/no-unused-expressions", severity: 2 })]))
  })

  for (const command of ["lint", "lint:eslint", "lint:eslint:fix", "lint:ci"]) {
    it(`fails ${command} before its lint child when snapshot integrity fails`, () => {
      const root = processFixture()
      write(root, EXPORTS[0], "changed")
      const report = join(root, "lint-output.json")
      const args = command === "lint:ci" ? ["--base=HEAD"] : ["--no-fix", "--format=json", `--output-file=${report}`]
      const result = run(root, [command, ...args])
      expect(result.status).toBe(1)
      expect(result.stdout).toContain("snapshot integrity mismatch")
      expect(existsSync(report)).toBe(false)
      expect(existsSync(join(root, "helper-ran"))).toBe(false)
    }, 30000)
  }

  it("preserves actual ESLint failure and report arguments after the guard passes", () => {
    const root = processFixture(), report = join(root, "lint-output.json")
    const args = ["lint", "--no-fix", "--format=json", `--output-file=${report}`]
    const result = run(root, args)
    expect(result.status).toBe(1)
    const files = JSON.parse(readFileSync(report, "utf8")) as Array<{messages: Array<{ruleId: string}>}>
    expect(files.flatMap(file => file.messages)).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "no-undef" })]))
    write(root, "bad.js", "const defined = 1; void defined;\n")
    expect(run(root, args).status).toBe(0)
  }, 30000)

  it("runs the guard even when the changed-file helper has an empty successful selection", () => {
    const root = processFixture()
    const result = run(root, ["lint:ci", "--base=HEAD"])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"status":"passed"')
    expect(readFileSync(join(root, "helper-ran"), "utf8")).toBe("ran")
  }, 30000)
})
