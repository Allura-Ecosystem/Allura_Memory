import { JSDOM } from "jsdom"

import { createHash } from "node:crypto"
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { Script } from "node:vm"

export const PROJECT = "docs/design/command-center/project"
export const EXPORTS = Object.freeze([
  `${PROJECT}/support.js`,
  `${PROJECT}/_ds/allura-design-system-d83f547a-10de-4c68-9b53-504f3a74662a/_ds_bundle.js`,
])
export const CONSUMER = `${PROJECT}/Allura Memory Command Center.dc.html`
export const INVENTORY = "scripts/ci/historical-generated-exports.json"
const SOURCES = Object.freeze([
  "./support.js",
  "_ds/allura-design-system-d83f547a-10de-4c68-9b53-504f3a74662a/_ds_bundle.js",
])
const DISCLAIMER = "docs/design/command-center/README.md"
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const assert = (condition, message) => { if (!condition) throw new Error(message) }

function regularFile(root, path) {
  let current = root
  const parts = path.split("/")
  for (const [index, part] of parts.entries()) {
    assert(part && part !== "." && part !== "..", "invalid path component")
    current = join(current, part)
    const stat = lstatSync(current)
    assert(!stat.isSymbolicLink(), `symlink refused: ${path}`)
    assert(index === parts.length - 1 ? stat.isFile() : stat.isDirectory(), `nonregular path: ${path}`)
  }
  return current
}

export function compileClassicScript(text, filename) {
  // Construction compiles only. Never execute historical export code here.
  new Script(text, { filename })
}

export function validateConsumerReferences(html) {
  // Defaults are deliberately inert: no scripts execute and no resources load.
  const dom = new JSDOM(html)
  try {
    const doc = dom.window.document
    assert(doc.querySelectorAll("base").length === 0, "base URL refused")
    const scripts = [...doc.querySelectorAll("script")]
    assert(scripts.length === 3, "expected exactly three consumer script elements")
    for (let index = 0; index < SOURCES.length; index++) {
      const script = scripts[index]
      assert(script.getAttribute("src") === SOURCES[index], "external script reference/order changed")
      assert(!script.hasAttribute("type") && !script.textContent.trim(), "expected external classic script")
      assert(resolve(dirname(CONSUMER), SOURCES[index]) === resolve(EXPORTS[index]), "script target differs from inventory")
    }
    const inline = scripts[2]
    assert(!inline.hasAttribute("src") && inline.getAttribute("type") === "text/x-dc"
      && inline.hasAttribute("data-dc-script") && inline.textContent.trim(), "expected one inline DC script")
    compileClassicScript(inline.textContent, `${CONSUMER}:text/x-dc`)
  } finally {
    dom.window.close()
  }
}

function validateInventory(inventory) {
  assert(inventory?.schema_version === 1 && Array.isArray(inventory.artifacts), "invalid inventory schema")
  assert(inventory.artifacts.length === EXPORTS.length, "inventory must contain exactly two exports")
  for (const [index, item] of inventory.artifacts.entries()) {
    assert(item?.file === EXPORTS[index] && item.script_src === SOURCES[index], "inventory path/order differs from fixed allowlist")
    assert(Number.isSafeInteger(item.bytes) && item.bytes > 0, "invalid inventory byte size")
    assert(typeof item.sha256 === "string" && /^[a-f0-9]{64}$/.test(item.sha256), "invalid inventory digest")
  }
  assert(inventory.consumer?.file === CONSUMER
    && typeof inventory.consumer.sha256 === "string"
    && /^[a-f0-9]{64}$/.test(inventory.consumer.sha256), "invalid consumer inventory")
  assert(inventory.disclaimer === DISCLAIMER, "invalid disclaimer path")
}

function checkProjectFiles(root, path = PROJECT) {
  for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`
    assert(!entry.isSymbolicLink(), `symlink refused: ${child}`)
    if (entry.isDirectory()) checkProjectFiles(root, child)
    else if (/\.(?:js|mjs|cjs|jsx)$/i.test(entry.name)) {
      assert(entry.isFile() && EXPORTS.includes(child), `unlisted historical script: ${child}`)
    }
  }
}

export function validateGeneratedExports(rootPath = process.cwd()) {
  const root = realpathSync(rootPath)
  const observed = []
  const report = { status: "failed", scope: "historical snapshot integrity; not rendering or product acceptance", observed, errors: [] }
  try {
    const inventory = JSON.parse(readFileSync(regularFile(root, INVENTORY), "utf8"))
    validateInventory(inventory)
    for (const item of inventory.artifacts) {
      const bytes = readFileSync(regularFile(root, item.file))
      const digest = sha256(bytes)
      const result = { file: item.file, bytes: bytes.length, sha256: digest, parsed: false }
      observed.push(result)
      assert(bytes.length === item.bytes && digest === item.sha256, `snapshot integrity mismatch: ${item.file}`)
      compileClassicScript(bytes.toString("utf8"), item.file)
      result.parsed = true
    }
    const html = readFileSync(regularFile(root, CONSUMER))
    const digest = sha256(html)
    observed.push({ file: CONSUMER, bytes: html.length, sha256: digest, parsed: false })
    assert(digest === inventory.consumer.sha256, "consumer integrity mismatch")
    validateConsumerReferences(html.toString("utf8"))
    observed.at(-1).parsed = true
    const disclaimer = readFileSync(regularFile(root, DISCLAIMER), "utf8")
    assert(disclaimer.includes("historical HTML/CSS design export")
      && disclaimer.includes("not implementation instructions, current product acceptance, or evidence of a working dashboard"), "historical disclaimer missing")
    checkProjectFiles(root)
    report.status = "passed"
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
  }
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) {
    console.error("No path, inventory override or update option is supported")
    process.exitCode = 64
  } else {
    const report = validateGeneratedExports()
    console.log(JSON.stringify(report))
    process.exitCode = report.status === "passed" ? 0 : 1
  }
}
