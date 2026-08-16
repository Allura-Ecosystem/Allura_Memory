#!/usr/bin/env bun

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"

export type CommandStatus = "passed" | "failed"
export type LaneStatus = CommandStatus | "missing"

export const REQUIRED_BENCHMARK_IDS = [
  "retrieval-quality",
  "curation-accuracy",
  "governance-integrity",
  "latency-profile",
  "audit-completeness",
] as const

export interface CommandEvidence {
  name: string
  command: string[]
  started_at: string
  duration_ms: number
  exit_status: number
  status: CommandStatus
  artifact_paths: string[]
}

export interface LaneEvidence {
  schema_version: "1.0.0"
  kind: "lane-fragment"
  commit_sha: string
  run_url: string | null
  lane: string
  status: CommandStatus
  environment: {
    bun: string
    node: string
    postgresql: string | null
  }
  commands: CommandEvidence[]
}

export interface EvidenceManifest {
  schema_version: "1.0.0"
  kind: "ci-evidence-manifest"
  commit_sha: string
  generated_at: string
  run_url: string | null
  status: LaneStatus
  environment: {
    bun: string
    node: string
    postgresql: string | null
  }
  missing_lanes: string[]
  lanes: Array<{
    lane: string
    status: LaneStatus
    commands: CommandEvidence[]
  }>
  artifacts: Array<{
    lane: string
    logical_name: string
    path: string
    run_url: string | null
  }>
}

export interface ParsedArgs {
  command: string
  options: Map<string, string[]>
  passthrough: string[]
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? ""
  const options = new Map<string, string[]>()
  const separator = argv.indexOf("--")
  const optionArgs = separator === -1 ? argv.slice(1) : argv.slice(1, separator)
  const passthrough = separator === -1 ? [] : argv.slice(separator + 1)

  for (const arg of optionArgs) {
    if (!arg.startsWith("--") || !arg.includes("=")) {
      throw new Error(`invalid option ${arg}; expected --name=value`)
    }
    const [key, ...parts] = arg.slice(2).split("=")
    const value = parts.join("=")
    options.set(key, [...(options.get(key) ?? []), value])
  }
  return { command, options, passthrough }
}

function option(args: ParsedArgs, name: string, required = true): string | undefined {
  const value = args.options.get(name)?.at(-1)
  if (required && !value) throw new Error(`missing --${name}=...`)
  return value
}

function repoRelative(path: string): string {
  const value = relative(process.cwd(), resolve(process.cwd(), path)).replaceAll("\\", "/")
  if (value.startsWith("../") || value === "..") throw new Error(`artifact path leaves repository: ${path}`)
  return value
}

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "ignore" })
  if (result.exitCode !== 0) throw new Error("unable to resolve commit SHA")
  return result.stdout.toString().trim()
}

function runUrl(): string | null {
  if (process.env.CI_RUN_URL) return process.env.CI_RUN_URL
  const repository = process.env.GITHUB_REPOSITORY
  const runId = process.env.GITHUB_RUN_ID
  return repository && runId ? `https://github.com/${repository}/actions/runs/${runId}` : null
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
}

export function validateVitestReport(report: unknown): string | null {
  if (typeof report !== "object" || report === null) return "Vitest report is not an object"
  const object = report as Record<string, unknown>
  const total = nonNegativeInteger(object.numTotalTests)
  const passed = nonNegativeInteger(object.numPassedTests)
  const failed = nonNegativeInteger(object.numFailedTests)
  const pending = nonNegativeInteger(object.numPendingTests)
  if (total === null || passed === null || failed === null || pending === null) {
    return "Vitest report must contain non-negative integer total/passed/failed/pending counters"
  }
  if (total !== passed + failed + pending) {
    return `Vitest report counters are inconsistent: total=${total}, passed=${passed}, failed=${failed}, pending=${pending}`
  }
  if (total === 0) return "Vitest report contains zero tests"
  if (failed > 0) return `Vitest report declares ${failed} failed test(s)`
  if (passed === 0) return `Vitest report contains zero passed tests (${pending} pending/skipped)`
  return null
}

export function validateBenchmarkReport(report: unknown, expectedIds: readonly string[]): string | null {
  if (typeof report !== "object" || report === null) return "benchmark report is not an object"
  const results = (report as Record<string, unknown>).results
  if (!Array.isArray(results) || results.length === 0) return "benchmark report contains no results"
  const duplicateExpected = expectedIds.filter((id, index) => expectedIds.indexOf(id) !== index)
  if (duplicateExpected.length > 0) return `expected benchmark IDs contain duplicates: ${[...new Set(duplicateExpected)].join(", ")}`

  const ids: string[] = []
  for (const entry of results) {
    if (typeof entry !== "object" || entry === null) return "benchmark report contains a malformed result"
    const id = (entry as Record<string, unknown>).id
    const status = (entry as Record<string, unknown>).status
    if (typeof id !== "string" || !id) return "benchmark report contains a result without an ID"
    if (status !== "pass" && status !== "fail" && status !== "skip" && status !== "error") {
      return `benchmark ${id} has invalid status ${String(status)}`
    }
    ids.push(id)
  }

  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicates.length > 0) return `benchmark report contains duplicate IDs: ${[...new Set(duplicates)].join(", ")}`
  const missing = expectedIds.filter((id) => !ids.includes(id))
  if (missing.length > 0) return `benchmark report is missing required IDs: ${missing.join(", ")}`
  const unexpected = ids.filter((id) => !expectedIds.includes(id))
  if (unexpected.length > 0) return `benchmark report contains unexpected IDs: ${unexpected.join(", ")}`
  const incomplete = results.find((entry) => {
    const status = (entry as Record<string, unknown>).status
    return status === "skip" || status === "error"
  }) as Record<string, unknown> | undefined
  return incomplete ? `required benchmark ${String(incomplete.id)} did not execute successfully (${String(incomplete.status)})` : null
}

export async function missingDeclaredArtifacts(paths: readonly string[]): Promise<string[]> {
  const existing = await existingDeclaredArtifacts(paths)
  const existingSet = new Set(existing)
  return paths.filter((path) => !existingSet.has(path))
}

async function existingDeclaredArtifacts(paths: readonly string[]): Promise<string[]> {
  const existing: string[] = []
  for (const path of paths) {
    try {
      const metadata = await stat(resolve(process.cwd(), path))
      if (metadata.isFile()) existing.push(path)
    } catch {}
  }
  return existing
}

async function readPostgresServerVersion(path: string): Promise<string> {
  const value = (await readFile(resolve(process.cwd(), path), "utf8")).trim()
  if (!value || value.includes("\n") || value.includes("\r")) {
    throw new Error("server version artifact must contain exactly one non-empty line")
  }
  return `PostgreSQL ${value}`
}

async function validateRequiredOutput(args: ParsedArgs): Promise<string | null> {
  const vitestPath = option(args, "require-vitest-results", false)
  if (vitestPath) {
    try {
      const error = validateVitestReport(await readJson(vitestPath))
      if (error) return `${vitestPath}: ${error}`
    } catch (error) {
      return `unable to validate Vitest report ${vitestPath}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  const benchmarkPath = option(args, "require-benchmark-results", false)
  if (benchmarkPath) {
    try {
      const expectedIds = option(args, "expected-benchmark-ids")?.split(",").map((id) => id.trim()).filter(Boolean) ?? []
      return validateBenchmarkReport(await readJson(benchmarkPath), expectedIds)
    } catch (error) {
      return `unable to validate benchmark report ${benchmarkPath}: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return null
}

export async function recordCommand(args: ParsedArgs): Promise<number> {
  const lane = option(args, "lane")!
  const name = option(args, "name")!
  const artifactDir = resolve(process.cwd(), option(args, "artifact-dir")!)
  const declaredArtifacts = (args.options.get("artifact") ?? []).map(repoRelative)
  if (args.passthrough.length === 0) throw new Error("run requires a command after --")
  await mkdir(artifactDir, { recursive: true })

  const startedAt = new Date().toISOString()
  const started = performance.now()
  let exitStatus = 127
  try {
    const child = Bun.spawn(args.passthrough, { stdin: "inherit", stdout: "inherit", stderr: "inherit", env: process.env })
    exitStatus = await child.exited
  } catch (error) {
    process.stderr.write(`[ci-evidence] command spawn failed: ${error instanceof Error ? error.message : String(error)}\n`)
  }

  let serverVersion: string | null = null
  let serverVersionError: string | null = null
  const existingArtifacts = await existingDeclaredArtifacts(declaredArtifacts)
  const serverVersionPath = option(args, "postgres-server-version-file", false)
  if (serverVersionPath) {
    try {
      serverVersion = await readPostgresServerVersion(serverVersionPath)
    } catch (error) {
      serverVersionError = `unable to read PostgreSQL server version: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  if (exitStatus === 0) {
    const validationErrors: string[] = []
    const outputError = await validateRequiredOutput(args)
    if (outputError) validationErrors.push(outputError)
    const missingArtifacts = await missingDeclaredArtifacts(declaredArtifacts)
    if (missingArtifacts.length > 0) validationErrors.push(`declared artifacts are missing or not files: ${missingArtifacts.join(", ")}`)
    if (serverVersionError) validationErrors.push(serverVersionError)
    if (validationErrors.length > 0) {
      process.stderr.write(`[ci-evidence] ${validationErrors.join("; ")}\n`)
      exitStatus = 66
    }
  }

  const fragmentPath = resolve(artifactDir, "evidence-fragment.json")
  let fragment: LaneEvidence = {
    schema_version: "1.0.0",
    kind: "lane-fragment",
    commit_sha: gitSha(),
    run_url: runUrl(),
    lane,
    status: "passed",
    environment: { bun: Bun.version, node: process.version, postgresql: serverVersion },
    commands: [],
  }

  try {
    const prior = (await readJson(fragmentPath)) as LaneEvidence
    if (prior.kind !== "lane-fragment" || prior.commit_sha !== fragment.commit_sha || prior.lane !== lane) {
      throw new Error("existing fragment identity does not match this command")
    }
    fragment = prior
    if (serverVersion) fragment.environment.postgresql = serverVersion
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  const status: CommandStatus = exitStatus === 0 ? "passed" : "failed"
  fragment.commands.push({
    name,
    command: args.passthrough,
    started_at: startedAt,
    duration_ms: Math.round(performance.now() - started),
    exit_status: exitStatus,
    status,
    artifact_paths: existingArtifacts,
  })
  fragment.status = fragment.commands.every((entry) => entry.status === "passed") ? "passed" : "failed"
  await writeFile(fragmentPath, `${JSON.stringify(fragment, null, 2)}\n`, "utf8")
  return exitStatus
}

async function findFiles(root: string, name: string): Promise<string[]> {
  const matches: string[] = []
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  for (const entry of entries) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) matches.push(...(await findFiles(path, name)))
    else if (entry.isFile() && entry.name === name) matches.push(path)
  }
  return matches.sort()
}

function schemaErrors(value: unknown, schema: unknown, path = "$", rootSchema: unknown = schema): string[] {
  if (typeof schema !== "object" || schema === null) return [`${path}: invalid schema`]
  const spec = schema as Record<string, unknown>
  if (typeof spec.$ref === "string" && spec.$ref.startsWith("#/$defs/")) {
    const name = spec.$ref.slice("#/$defs/".length)
    const definitions = (rootSchema as Record<string, unknown>).$defs as Record<string, unknown> | undefined
    if (!definitions?.[name]) return [`${path}: unresolved schema reference ${spec.$ref}`]
    return schemaErrors(value, definitions[name], path, rootSchema)
  }
  const errors: string[] = []
  const type = spec.type
  const actualType = Array.isArray(value) ? "array" : value === null ? "null" : typeof value
  const accepted = Array.isArray(type) ? type : type ? [type] : []
  if (accepted.length > 0 && !accepted.includes(actualType)) return [`${path}: expected ${accepted.join("|")}, got ${actualType}`]
  if (Array.isArray(spec.enum) && !spec.enum.includes(value)) errors.push(`${path}: value is outside enum`)
  if (typeof value === "string") {
    if (typeof spec.pattern === "string" && !new RegExp(spec.pattern).test(value)) errors.push(`${path}: pattern mismatch`)
    if (spec.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${path}: invalid date-time`)
  }
  if (typeof value === "number" && typeof spec.minimum === "number" && value < spec.minimum) errors.push(`${path}: below minimum`)
  if (Array.isArray(value)) {
    if (typeof spec.minItems === "number" && value.length < spec.minItems) errors.push(`${path}: too few items`)
    if (spec.items) value.forEach((entry, index) => errors.push(...schemaErrors(entry, spec.items, `${path}[${index}]`, rootSchema)))
  }
  if (actualType === "object") {
    const object = value as Record<string, unknown>
    const properties = (spec.properties ?? {}) as Record<string, unknown>
    for (const key of (spec.required ?? []) as string[]) if (!(key in object)) errors.push(`${path}.${key}: required`)
    for (const [key, entry] of Object.entries(object)) {
      if (key in properties) errors.push(...schemaErrors(entry, properties[key], `${path}.${key}`, rootSchema))
      else if (spec.additionalProperties === false) errors.push(`${path}.${key}: additional property`)
    }
  }
  return errors
}

export function validateAgainstSchema(value: unknown, schema: unknown): string[] {
  return schemaErrors(value, schema)
}

export function buildEvidenceManifest(args: {
  expectedLanes: string[]
  fragments: LaneEvidence[]
  commitSha: string
  generatedAt: string
  runUrl: string | null
  bunVersion: string
  nodeVersion: string
}): EvidenceManifest {
  const byLane = new Map(args.fragments.filter((entry) => entry.commit_sha === args.commitSha).map((entry) => [entry.lane, entry]))
  const missingLanes = args.expectedLanes.filter((lane) => !byLane.has(lane))
  const lanes: EvidenceManifest["lanes"] = args.expectedLanes.map((lane) => {
    const fragment = byLane.get(lane)
    return { lane, status: fragment?.status ?? "missing", commands: fragment?.commands ?? [] }
  })
  const artifacts = lanes.flatMap((lane) => lane.commands.flatMap((command) => command.artifact_paths.map((path) => ({
    lane: lane.lane,
    logical_name: path.split("/").at(-1) ?? path,
    path,
    run_url: args.runUrl,
  }))))
  const pgVersion = byLane.get("live-db")?.environment.postgresql
    ?? byLane.get("benchmark")?.environment.postgresql
    ?? null
  const status: LaneStatus = missingLanes.length > 0 || lanes.some((lane) => lane.status !== "passed") ? "failed" : "passed"
  return {
    schema_version: "1.0.0",
    kind: "ci-evidence-manifest",
    commit_sha: args.commitSha,
    generated_at: args.generatedAt,
    run_url: args.runUrl,
    status,
    environment: { bun: args.bunVersion, node: args.nodeVersion, postgresql: pgVersion },
    missing_lanes: missingLanes,
    lanes,
    artifacts,
  }
}

export async function aggregateEvidence(args: ParsedArgs): Promise<number> {
  const inputDir = resolve(process.cwd(), option(args, "input-dir")!)
  const output = resolve(process.cwd(), option(args, "output")!)
  const schemaPath = resolve(process.cwd(), option(args, "schema")!)
  const expectedLanes = option(args, "expected-lanes")!.split(",").map((entry) => entry.trim()).filter(Boolean)
  const sha = gitSha()
  const fragments = await Promise.all((await findFiles(inputDir, "evidence-fragment.json")).map(async (path) => (await readJson(path)) as LaneEvidence))
  const manifest = buildEvidenceManifest({
    expectedLanes,
    fragments,
    commitSha: sha,
    generatedAt: new Date().toISOString(),
    runUrl: runUrl(),
    bunVersion: Bun.version,
    nodeVersion: process.version,
  })
  const errors = validateAgainstSchema(manifest, await readJson(schemaPath))
  if (errors.length > 0) throw new Error(`evidence manifest failed schema validation:\n${errors.join("\n")}`)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  process.stdout.write(`[ci-evidence] wrote ${repoRelative(output)} (${manifest.status})\n`)
  return manifest.status === "passed" ? 0 : 1
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.command === "run") return recordCommand(args)
  if (args.command === "aggregate") return aggregateEvidence(args)
  throw new Error("usage: collect-evidence.ts <run|aggregate> [--option=value] [-- command ...]")
}

if (import.meta.main) {
  main().then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`[ci-evidence] ${error instanceof Error ? error.stack : String(error)}\n`)
    process.exit(1)
  })
}
