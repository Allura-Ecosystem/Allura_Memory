import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

export type Epic30LocalState = "prepared" | "partial" | "not_implemented" | "complete"

export interface Epic30RemainingGate {
  id: string
  kind: string
  proofRequired: string
}

export interface Epic30StoryChecklist {
  id: string
  localState: Epic30LocalState
  evidence: string[]
  remaining: Epic30RemainingGate[]
}

export interface Epic30CompletionChecklist {
  schemaVersion: number
  epic: string
  overallState: "hold" | "complete"
  canonicalBranch: string
  verificationCommands: string[]
  stories: Epic30StoryChecklist[]
}

export interface Epic30ChecklistAudit {
  valid: boolean
  complete: boolean
  errors: string[]
  pendingGateCount: number
  notImplementedStories: string[]
}

const EXPECTED_STORIES = Array.from({ length: 13 }, (_, index) => `30.${index + 1}`)
const LOCAL_STATES = new Set<Epic30LocalState>(["prepared", "partial", "not_implemented", "complete"])
const REQUIRED_VERIFICATION_COMMANDS = [
  "bun run test:epic30-hermetic",
  "bun run test:unit",
  "bun run test:epic30-controlled-red",
  "bun run test:epic30-live",
]

export function auditEpic30Checklist(checklist: Epic30CompletionChecklist, root: string): Epic30ChecklistAudit {
  const errors: string[] = []
  if (checklist.schemaVersion !== 1) errors.push("schemaVersion must be 1")
  if (checklist.epic !== "30") errors.push("epic must be 30")
  if (checklist.canonicalBranch !== "main") errors.push("canonicalBranch must be main")
  if (JSON.stringify(checklist.verificationCommands) !== JSON.stringify(REQUIRED_VERIFICATION_COMMANDS)) {
    errors.push("all four verification commands are required")
  }
  const stories = Array.isArray(checklist.stories) ? checklist.stories : []
  const storyIds = stories.map(({ id }) => id)
  if (JSON.stringify(storyIds) !== JSON.stringify(EXPECTED_STORIES)) {
    errors.push("stories must contain 30.1 through 30.13 exactly once and in order")
  }

  let pendingGateCount = 0
  const notImplementedStories: string[] = []
  for (const story of stories) {
    if (!LOCAL_STATES.has(story.localState)) errors.push(`${story.id}: invalid localState`)
    if (!Array.isArray(story.evidence) || story.evidence.length === 0) errors.push(`${story.id}: evidence is required`)
    for (const evidence of story.evidence ?? []) {
      if (path.isAbsolute(evidence) || evidence.includes("..") || !existsSync(path.resolve(root, evidence))) {
        errors.push(`${story.id}: missing or unsafe evidence path ${evidence}`)
      }
    }
    const remaining = Array.isArray(story.remaining) ? story.remaining : []
    if (!Array.isArray(story.remaining)) errors.push(`${story.id}: remaining must be an array`)
    pendingGateCount += remaining.length
    if (story.localState === "complete" && remaining.length > 0) {
      errors.push(`${story.id}: complete stories cannot have remaining gates`)
    }
    if (story.localState !== "complete" && remaining.length === 0) {
      errors.push(`${story.id}: incomplete stories require at least one remaining gate`)
    }
    if (story.localState === "not_implemented") notImplementedStories.push(story.id)
    for (const gate of remaining) {
      if (!gate.id?.trim() || !gate.kind?.trim() || !gate.proofRequired?.trim()) {
        errors.push(`${story.id}: every remaining gate requires id, kind and proofRequired`)
      }
    }
    const artifactPrefix = `${story.id.replace(".", "-")}-`
    const artifactDirectory = path.resolve(root, "_bmad_output/implementation-artifacts")
    const storyArtifacts = existsSync(artifactDirectory)
      ? readdirSync(artifactDirectory).filter((name) => name.startsWith(artifactPrefix) && name.endsWith(".md"))
      : []
    if (storyArtifacts.length !== 1) {
      errors.push(`${story.id}: exactly one BMAD story artifact is required`)
    } else {
      const storySource = readFileSync(path.join(artifactDirectory, storyArtifacts[0]), "utf8")
      const trackedStatus = /^\*\*Status:\*\*\s+([^\s]+)/m.exec(storySource)?.[1]?.toLowerCase()
      if (story.localState === "complete" && trackedStatus !== "done") {
        errors.push(`${story.id}: completed evidence requires BMAD status done`)
      }
      if (story.localState !== "complete" && trackedStatus === "done") {
        errors.push(`${story.id}: BMAD status done contradicts remaining completion gates`)
      }
    }
  }

  const complete = errors.length === 0 && pendingGateCount === 0 && stories.length === 13 &&
    stories.every(({ localState }) => localState === "complete")
  if (complete !== (checklist.overallState === "complete")) {
    errors.push("overallState must equal the evidence-derived completion state")
  }
  return { valid: errors.length === 0, complete, errors, pendingGateCount, notImplementedStories }
}

export function loadEpic30Checklist(root = process.cwd()): Epic30CompletionChecklist {
  const checklistPath = path.resolve(root, "_bmad_output/planning-artifacts/epic-30-completion-checklist.json")
  return JSON.parse(readFileSync(checklistPath, "utf8")) as Epic30CompletionChecklist
}

if (import.meta.main) {
  const root = process.cwd()
  const audit = auditEpic30Checklist(loadEpic30Checklist(root), root)
  const requireComplete = process.argv.includes("--require-complete")
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`)
  if (!audit.valid || (requireComplete && !audit.complete)) process.exitCode = 1
}
