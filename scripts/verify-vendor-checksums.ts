#!/usr/bin/env bun
/**
 * Vendored-artifact checksum gate (AD-50 / RK-16 R2).
 *
 * Verifies every vendored native binary against its recorded SHA-256 so a
 * committed `.node` can never silently drift from its pinned, reviewed
 * provenance. Run in pre-commit and CI:
 *
 *   bun run validate:vendor
 *
 * Manifests are `CHECKSUMS.sha256` files anywhere under `vendor/`, in the
 * standard `sha256sum` format (`<hex>  <path-relative-to-manifest>`); lines
 * starting with `#` and blank lines are ignored.
 *
 * Exit codes: 0 = all match · 1 = mismatch / missing file / no manifests.
 */

import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

const VENDOR_ROOT = resolve(import.meta.dir, "..", "vendor")

interface Entry {
  expected: string
  file: string // absolute
  rel: string // as written in the manifest
  manifest: string
}

async function findManifests(dir: string): Promise<string[]> {
  const out: string[] = []
  let dirents
  try {
    dirents = await readdir(dir, { withFileTypes: true })
  } catch {
    return out // vendor/ absent — handled by caller
  }
  for (const d of dirents) {
    const full = join(dir, d.name)
    if (d.isDirectory()) out.push(...(await findManifests(full)))
    else if (d.name === "CHECKSUMS.sha256") out.push(full)
  }
  return out
}

function parseManifest(manifest: string, text: string): Entry[] {
  const base = dirname(manifest)
  const entries: Entry[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#")) continue
    const m = line.match(/^([0-9a-fA-F]{64})\s+(.+)$/)
    if (!m) {
      throw new Error(`malformed line in ${manifest}: ${raw}`)
    }
    const rel = m[2].trim()
    entries.push({
      expected: m[1].toLowerCase(),
      rel,
      file: resolve(base, rel),
      manifest,
    })
  }
  return entries
}

async function sha256(file: string): Promise<string> {
  const buf = await readFile(file)
  return createHash("sha256").update(buf).digest("hex")
}

async function main(): Promise<void> {
  const manifests = await findManifests(VENDOR_ROOT)
  if (manifests.length === 0) {
    console.error("✗ no vendor/**/CHECKSUMS.sha256 manifests found — nothing to verify")
    process.exit(1)
  }

  let checked = 0
  const failures: string[] = []

  for (const manifest of manifests) {
    const text = await readFile(manifest, "utf8")
    for (const entry of parseManifest(manifest, text)) {
      checked++
      let actual: string
      try {
        actual = await sha256(entry.file)
      } catch {
        failures.push(`MISSING  ${entry.rel}  (listed in ${entry.manifest})`)
        continue
      }
      if (actual !== entry.expected) {
        failures.push(
          `MISMATCH ${entry.rel}\n         expected ${entry.expected}\n         actual   ${actual}`
        )
      }
    }
  }

  if (failures.length > 0) {
    console.error(`✗ vendor checksum verification FAILED (${failures.length}/${checked}):`)
    for (const f of failures) console.error(`  ${f}`)
    process.exit(1)
  }

  console.log(`✓ vendor checksum verification passed (${checked} artifact${checked === 1 ? "" : "s"})`)
}

main().catch((err: unknown) => {
  console.error(`✗ vendor checksum verification errored: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
