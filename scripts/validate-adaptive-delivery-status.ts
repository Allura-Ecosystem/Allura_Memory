#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const failures: string[] = []
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

for (const retiredRoot of ["_bmad", "_bmad_output", ".bmad-loop"]) {
  if (existsSync(path.join(root, retiredRoot))) {
    failures.push(`retired active root still exists: ${retiredRoot}`)
  }
}

const commands = readdirSync(path.join(root, ".opencode/commands"))
if (commands.some((name) => name.startsWith("bmad-"))) failures.push("retired command alias remains active")
if (!existsSync(path.join(root, "docs/archive/bmad-legacy/retired-2026-10-15"))) failures.push("retired methodology archive is missing")

const guidelines = read("guidelines/AI-GUIDELINES.md")
if (!guidelines.includes("## 10. Allura Adaptive Delivery")) failures.push("Adaptive Delivery contract is missing")
if (!guidelines.includes("read-only historical lineage")) failures.push("archive read-only boundary is missing")
if (!guidelines.includes("Notion syncs and any change to `Done` or `Approved` require action-specific human approval")) failures.push("status approval boundary is missing")
if (!read(".opencode/context/core/system/documentation-authority.md").includes("never current planning or status authority")) failures.push("documentation authority still permits archived status")

if (failures.length) {
  console.error("Adaptive Delivery status authority validation failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log("Adaptive Delivery status authority validation passed.")
