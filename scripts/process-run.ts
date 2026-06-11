#!/usr/bin/env bun
/**
 * Headless Process Runner — Story 12.5
 * Executes governed process definitions without interactive agents.
 *
 * Usage:
 *   bun run process:run ./processes/example-process.ts --group-id allura-system
 *   bun run process:run ./processes/nightly-audit.ts --auto-approve --dry-run
 *   bun run process:resume <process-id>
 *   bun run process:replay <process-id> --format json
 *
 * Exit codes:
 *   0 — success (all steps completed)
 *   1 — gate failure (a required gate condition was false)
 *   2 — error (unexpected failure / unhandled exception)
 *   3 — checkpoint blocked (process paused, awaits human approval)
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-run is server-side only")
}

import path from "path"
import { parseArgs } from "util"
import { ProcessEngine, ProcessStateManager } from "../src/lib/process-engine"
import { getPool, closePool } from "../src/lib/postgres/connection"
import {
  CheckpointBlockedError,
  GateFailedError,
} from "../src/lib/process-engine"
import type { ProcessDefinition, ProcessState } from "../src/lib/process-engine"

// ── CLI Argument Parsing ───────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "group-id": { type: "string", default: "allura-system" },
    "auto-approve": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    format: { type: "string", default: "text" }, // text | json
    "agent-id": { type: "string", default: "headless-runner" },
  },
  allowPositionals: true,
  strict: false,
})

const groupId = (values["group-id"] as string) ?? "allura-system"
const autoApprove = (values["auto-approve"] as boolean) ?? false
const dryRun = (values["dry-run"] as boolean) ?? false
const format = (values["format"] as string) ?? "text"
const agentId = (values["agent-id"] as string) ?? "headless-runner"

// ── Logger ─────────────────────────────────────────────────────────────────────

const startMs = Date.now()

function timestamp(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, "0")
  const m = String(now.getMinutes()).padStart(2, "0")
  const s = String(now.getSeconds()).padStart(2, "0")
  return `${h}:${m}:${s}`
}

function elapsed(): string {
  const ms = Date.now() - startMs
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function pad(label: string, width = 10): string {
  return label.padEnd(width, " ")
}

function dotpad(text: string, totalWidth = 28): string {
  if (text.length >= totalWidth) return text
  return text + " " + ".".repeat(totalWidth - text.length - 1)
}

type LogEvent =
  | { kind: "start"; processId: string; name: string }
  | { kind: "step"; stepId: string; stepName: string; status: string; durationMs?: number }
  | { kind: "gate"; stepId: string; stepName: string; status: string }
  | { kind: "checkpoint"; stepId: string; stepName: string; status: string }
  | { kind: "done"; processId: string; name: string }
  | { kind: "error"; message: string }
  | { kind: "blocked"; processId: string; stepId: string }
  | { kind: "replay"; state: ProcessState }

function log(event: LogEvent): void {
  if (format === "json") {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n")
    return
  }

  const ts = timestamp()
  switch (event.kind) {
    case "start":
      process.stdout.write(`[${ts}] ${pad("START")} process: ${event.name}\n`)
      break
    case "step": {
      const dur = event.durationMs !== undefined ? ` (${event.durationMs}ms)` : ""
      process.stdout.write(
        `[${ts}] ${pad("STEP")} ${dotpad(event.stepName)} ${event.status}${dur}\n`,
      )
      break
    }
    case "gate":
      process.stdout.write(`[${ts}] ${pad("GATE")} ${dotpad(event.stepName)} ${event.status}\n`)
      break
    case "checkpoint":
      process.stdout.write(
        `[${ts}] ${pad("CHECK")} ${dotpad(event.stepName)} ${event.status}\n`,
      )
      break
    case "done":
      process.stdout.write(`[${ts}] ${pad("DONE")} process: ${event.name} (${elapsed()})\n`)
      break
    case "error":
      process.stderr.write(`[${ts}] ${pad("ERROR")} ${event.message}\n`)
      break
    case "blocked":
      process.stderr.write(
        `[${ts}] ${pad("BLOCKED")} process ${event.processId} paused at checkpoint ${event.stepId}\n`,
      )
      process.stderr.write(
        `         Run: bun run process:resume ${event.processId}\n`,
      )
      break
    case "replay": {
      const s = event.state
      process.stdout.write(`Process: ${s.processId}\n`)
      process.stdout.write(`Status:  ${s.status}\n`)
      process.stdout.write(`Started: ${s.startedAt}\n`)
      if (s.completedAt) process.stdout.write(`Ended:   ${s.completedAt}\n`)
      process.stdout.write(`\nStep timeline:\n`)
      for (const [stepId, stepStatus] of Object.entries(s.stepStates)) {
        const result = s.stepResults[stepId]
        const resultStr = result !== undefined ? JSON.stringify(result).slice(0, 60) : ""
        process.stdout.write(`  ${pad(stepStatus, 12)} ${stepId}  ${resultStr}\n`)
      }
      break
    }
  }
}

// ── Dry-Run Engine Wrapper ─────────────────────────────────────────────────────

/**
 * Wraps a ProcessDefinition for dry-run mode.
 * Replaces all step.execute functions with a no-op logger.
 * Gate conditions are still evaluated.
 */
function wrapDryRun<TCtx>(def: ProcessDefinition<TCtx>): ProcessDefinition<TCtx> {
  return {
    ...def,
    steps: def.steps.map((s) => {
      if (s.type === "step" && s.execute) {
        return {
          ...s,
          execute: async () => {
            log({ kind: "step", stepId: s.id, stepName: s.name, status: "DRY-RUN (skipped)" })
            return { dryRun: true }
          },
        }
      }
      return s
    }),
  }
}

// ── Subcommand: run ────────────────────────────────────────────────────────────

async function cmdRun(definitionPath: string): Promise<number> {
  // Resolve the path relative to cwd
  const absolutePath = path.isAbsolute(definitionPath)
    ? definitionPath
    : path.resolve(process.cwd(), definitionPath)

  let mod: { default?: unknown }
  try {
    mod = await import(absolutePath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log({ kind: "error", message: `Failed to import process definition: ${msg}` })
    return 2
  }

  const rawDef = mod.default
  if (!rawDef || typeof rawDef !== "object" || !("id" in rawDef) || !("steps" in rawDef)) {
    log({
      kind: "error",
      message: `Process definition file must export a ProcessDefinition as default export`,
    })
    return 2
  }

  let def = rawDef as ProcessDefinition
  if (dryRun) {
    log({
      kind: "start",
      processId: "(dry-run)",
      name: `${def.name} [DRY-RUN]`,
    })
    def = wrapDryRun(def)
  }

  const pool = getPool()
  const engine = new ProcessEngine(pool)

  const promotionMode = autoApprove ? "auto" : "soc2"

  log({ kind: "start", processId: "(pending)", name: def.name })

  let state: ProcessState
  try {
    state = await engine.run(def, {
      agentId,
      promotionMode,
      metadata: { groupId, dryRun, autoApprove },
    })
  } catch (err) {
    if (err instanceof CheckpointBlockedError) {
      log({
        kind: "blocked",
        processId: err.processId,
        stepId: err.stepId ?? "unknown",
      })
      return 3
    }

    if (err instanceof GateFailedError) {
      log({
        kind: "error",
        message: `Gate failed: ${err.message}`,
      })
      return 1
    }

    const msg = err instanceof Error ? err.message : String(err)
    log({ kind: "error", message: `Unexpected error: ${msg}` })
    return 2
  }

  // Log step results
  for (const s of def.steps) {
    const stepStatus = state.stepStates[s.id] ?? "unknown"
    if (s.type === "gate") {
      const label = stepStatus === "completed" ? "PASSED" : stepStatus === "skipped" ? "SKIPPED" : "FAILED"
      log({ kind: "gate", stepId: s.id, stepName: s.name, status: label })
    } else if (s.type === "checkpoint") {
      const label =
        stepStatus === "completed"
          ? autoApprove
            ? "AUTO-APPROVED"
            : "APPROVED"
          : stepStatus === "blocked"
            ? "BLOCKED"
            : stepStatus.toUpperCase()
      log({ kind: "checkpoint", stepId: s.id, stepName: s.name, status: label })
    } else {
      const label = stepStatus === "completed" ? "COMPLETED" : stepStatus.toUpperCase()
      log({ kind: "step", stepId: s.id, stepName: s.name, status: label })
    }
  }

  if (state.status === "paused") {
    const blockedStep = Object.entries(state.stepStates).find(([, ss]) => ss === "blocked")
    log({
      kind: "blocked",
      processId: state.processId,
      stepId: blockedStep?.[0] ?? "unknown",
    })
    return 3
  }

  if (state.status === "failed") {
    log({
      kind: "error",
      message: state.error ?? "Process failed",
    })
    // Determine if this was a gate failure by checking step states
    const hasGateFail = Object.values(state.stepStates).some((ss) => ss === "failed")
    return hasGateFail ? 1 : 2
  }

  log({ kind: "done", processId: state.processId, name: def.name })
  return 0
}

// ── Subcommand: resume ─────────────────────────────────────────────────────────

async function cmdResume(processId: string): Promise<number> {
  const pool = getPool()
  const engine = new ProcessEngine(pool)

  try {
    const state = await engine.resume(processId, {
      approvedBy: agentId,
      autoApprove,
    })

    if (format === "json") {
      process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), state }) + "\n")
    } else {
      process.stdout.write(`Resumed process ${processId}\n`)
      process.stdout.write(`Status: ${state.status}\n`)
    }

    if (state.status === "paused") {
      return 3
    }
    if (state.status === "failed") {
      return 2
    }
    return 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log({ kind: "error", message: `Resume failed: ${msg}` })
    return 2
  }
}

// ── Subcommand: replay ─────────────────────────────────────────────────────────

async function cmdReplay(processId: string): Promise<number> {
  const pool = getPool()
  const stateManager = new ProcessStateManager(pool)

  let state: ProcessState | null
  try {
    state = await stateManager.loadState(processId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log({ kind: "error", message: `Failed to load state: ${msg}` })
    return 2
  }

  if (!state) {
    log({ kind: "error", message: `No process found with id: ${processId}` })
    return 2
  }

  if (format === "json") {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), state }) + "\n")
    return 0
  }

  log({ kind: "replay", state })
  return 0
}

// ── Main Dispatch ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const subcommand = positionals[0]

    if (subcommand === "resume") {
      const processId = positionals[1]
      if (!processId) {
        log({ kind: "error", message: "Usage: bun run process:resume <process-id>" })
        process.exit(2)
      }
      exitCode = await cmdResume(processId)
    } else if (subcommand === "replay") {
      const processId = positionals[1]
      if (!processId) {
        log({ kind: "error", message: "Usage: bun run process:replay <process-id>" })
        process.exit(2)
      }
      exitCode = await cmdReplay(processId)
    } else {
      // Default subcommand: run
      const definitionPath = subcommand
      if (!definitionPath) {
        log({
          kind: "error",
          message: "Usage: bun run process:run <definition-file.ts> [--group-id allura-system] [--auto-approve] [--dry-run]",
        })
        process.exit(2)
      }
      exitCode = await cmdRun(definitionPath)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log({ kind: "error", message: `Fatal: ${msg}` })
    exitCode = 2
  } finally {
    await closePool()
  }

  process.exit(exitCode)
}

main()
