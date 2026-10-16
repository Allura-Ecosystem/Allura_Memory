#!/usr/bin/env bun

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const failures: string[] = []
const read = (relativePath: string) => {
  try {
    return readFileSync(path.join(root, relativePath), "utf8")
  } catch {
    failures.push(`required document is missing or unreadable: ${relativePath}`)
    return ""
  }
}

const sourceFileExists = (relativePath: string) => {
  try {
    return lstatSync(path.join(root, relativePath)).isFile()
  } catch {
    return false
  }
}

const tableRows = (document: string) =>
  document.split(/\r?\n/).filter((line) => line.trim().startsWith("|"))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()))

for (const retiredRoot of ["_bmad", "_bmad_output", ".bmad-loop"]) {
  if (existsSync(path.join(root, retiredRoot))) {
    failures.push(`retired active root still exists: ${retiredRoot}`)
  }
}

const commandsPath = path.join(root, ".opencode/commands")
const commands = existsSync(commandsPath) ? readdirSync(commandsPath) : []
if (!existsSync(commandsPath)) failures.push("active commands directory is missing")
if (commands.some((name) => name.startsWith("bmad-"))) {
  failures.push("retired command alias remains active")
}

if (!existsSync(path.join(root, "docs/archive/bmad-legacy/retired-2026-10-15"))) {
  failures.push("retired methodology archive is missing")
}

const guidelines = read("guidelines/AI-GUIDELINES.md")
if (!guidelines.includes("## 10. Allura Adaptive Delivery")) {
  failures.push("Adaptive Delivery contract is missing")
}
if (!guidelines.includes("read-only historical lineage")) {
  failures.push("archive read-only boundary is missing")
}
if (!guidelines.includes("Notion syncs and any change to `Done` or `Approved` require action-specific human approval")) {
  failures.push("status approval boundary is missing")
}

const authority = read(".opencode/context/core/system/documentation-authority.md")
if (!authority.includes("never current planning or status authority")) {
  failures.push("documentation authority still permits archived status")
}

const canonicalNames = [
  "BLUEPRINT", "DESIGN-ALLURA", "SOLUTION-ARCHITECTURE",
  "REQUIREMENTS-MATRIX", "RISKS-AND-DECISIONS", "DATA-DICTIONARY",
]
const canonical = new Map(canonicalNames.map((name) => [name, read(`docs/allura/${name}.md`)]))

for (const name of ["BLUEPRINT", "DESIGN-ALLURA"]) {
  const rows = tableRows(canonical.get(name) ?? "").filter(([id]) => id === "F43")
  if (rows.length === 0) failures.push(`${name}: F43 requirement row is missing`)
  for (const row of rows) {
    const assertion = /\bNotion\b[^.;|\n]*(?:source of truth|authority)\b/i.exec(row.join(" | "))
    if (!assertion || /\b(?:not|never)\b/i.test(assertion[0])) {
      failures.push(`${name}: F43 must identify Notion as planning/status authority`)
    }
  }
}

// Guard known authority regressions, not arbitrary natural-language policy.
const nativeAuthorityClaims = [
  /\bnative(?:[- ]+allura)?[- ]+(?:kanban|board)\b[^.;\n]*\b(?:as|is|remains|becomes)\s+(?:the\s+)?default\b/i,
  /\bnative(?:[- ]+allura)?[- ]+(?:kanban|board)\s*\|\s*default\b/i,
  /\bnative(?:[- ]+allura)?[- ]+(?:kanban|board)\b[^.\n]*\b(?:source of truth|authority)\s+by default\b/i,
  /\bmirror(?:s)? native allura state by default\b/i,
  /\bnative(?:[- ]+allura)?[- ]+(?:kanban|board)(?:\s+(?:is|remains|becomes)\s+|\s*\|\s*)(?:the\s+)?(?:current\s+)?(?:(?:human|planning|status)[ /-]+)*(?:authority|source of truth)\b/i,
]
for (const [name, document] of canonical) {
  document.split(/\r?\n/).forEach((line, index) => {
    if (nativeAuthorityClaims.some((claim) => claim.test(line))) {
      failures.push(`${name}:${index + 1}: native board cannot be the default or current planning/status authority`)
    }
  })
}

const blueprint = canonical.get("BLUEPRINT") ?? ""
const planningHeading = /^#{1,6}\s+.*\bEpic\s+30\s*\/\s*31\b.*$/im.exec(blueprint)
let planningSection = ""
if (planningHeading) {
  const remainder = blueprint.slice(planningHeading.index + planningHeading[0].length)
  const headingLevel = planningHeading[0].match(/^#+/)![0].length
  const nextHeading = new RegExp(`^#{1,${headingLevel}}\\s`, "m").exec(remainder)
  planningSection = remainder.slice(0, nextHeading?.index ?? remainder.length)
}
if (!/\bplanning\b/i.test(planningSection) || !/\bblocked\b/i.test(planningSection) ||
    !/\bproposals?\b/i.test(planningSection) || !/\breadiness\b/i.test(planningSection)) {
  failures.push("BLUEPRINT: explicit Epic 30/31 blocked planning/readiness section is missing")
}
if (/\b(?:planning disposition|readiness|board status)\s*(?::|is|remains)\s*(?:approved|complete|ready|done)\b/i
  .test(planningSection.replace(/\*\*/g, ""))) {
  failures.push("BLUEPRINT: Epic 30/31 planning/readiness metadata contradicts blocked proposals")
}
for (const epic of [30, 31]) {
  if (!tableRows(planningSection).some(([name]) => new RegExp(`\\bEpic\\s+${epic}\\b`, "i").test(name))) {
    failures.push(`BLUEPRINT: Epic ${epic} planning proposal row is missing`)
  }
}

const requirements = tableRows(canonical.get("REQUIREMENTS-MATRIX") ?? "")
for (let number = 4; number <= 9; number++) {
  const id = `REQ-DASH-00${number}`
  const rows = requirements.filter(([rowId]) => rowId === id)
  if (rows.length === 0) failures.push(`REQUIREMENTS-MATRIX: ${id} row is missing`)
  for (const row of rows) {
    const evidence = row.at(-1) ?? ""
    // Only explicit repository source paths are filesystem evidence. URL routes,
    // prose, and documentation anchors are not claims that source files exist.
    for (const citation of evidence.matchAll(/`([^`]+)`|\[[^\n]*?\]\(([^)]+)\)/g)) {
      const sourcePath = (citation[1] ?? citation[2]).replace(/^\.\//, "").split("#")[0]
      if (/^(?:src|tests|scripts|docker)\//.test(sourcePath) && !sourceFileExists(sourcePath)) {
        failures.push(`REQUIREMENTS-MATRIX: ${id} cites missing source evidence (expected a regular file): ${sourcePath}`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Adaptive Delivery status authority validation failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Adaptive Delivery status authority validation passed.")
