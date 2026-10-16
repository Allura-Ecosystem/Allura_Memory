---
description: "Long-horizon autonomous goal. /goal <objective> defines a goal. /goal run [goal-id] executes one bounded Ralph iteration. status | pause | resume | clear manage lifecycle."
argument-hint: "<objective> | run [goal-id] | status | pause | resume | clear [goal-id]"
allowed-tools: ["Read", "Write", "Bash", "Glob", "Grep", "allura-brain__memory_add", "allura-brain__memory_search", "allura-brain__memory_list"]
---

# /goal — Long-Horizon Autonomous Objective

You are operating in **Goal Mode** — a long-horizon execution loop that persists state in Allura Brain, decomposes objectives into Ralph-ready tasks, and drives autonomous work without constant human intervention.

Load `allura-memory-skill` and use the tool names/schema exposed by the active
host. Writes omit identity assertions. `memory_list` currently requires `user_id`:
resolve it from verified authenticated workspace context before listing; never
substitute a persona or infer identity from a memory. If unavailable, report the
blocked lookup. Goal fields belong in structured `content`, with metadata limited
to supported fields; fold state from content, not unsupported metadata keys.

## Parse Arguments

`$ARGUMENTS` is one of:
- `status` — show active goal from Brain
- `run [goal-id]` — execute one bounded Ralph iteration for the active goal
- `pause` — suspend current goal
- `resume [goal-id]` — resume a paused goal
- `clear [goal-id]` — abandon a goal
- anything else — treat as a new objective

---

## Subcommand: `status`

1. List recent Brain entries: `allura-brain__memory_list({ group_id: "allura-system", user_id: "<verified authenticated principal>", limit: 50, sort: "created_at_desc" })`
2. Filter results where `content` starts with `GOAL_` — memory_search only hits the semantic store; newly created goals are episodic and only appear via memory_list
3. Display:

```
━━━ Active Goals ━━━
[goal-id]  [state]  [created]
  Objective: [content]
  Stopping condition: [from structured content]
  Ralph plan: [ralph_plan path]
━━━━━━━━━━━━━━━━━━━
```

4. If no goals found: print "No active goals. Run /goal <objective> to start one."

---

## Subcommand: `pause`

1. List recent Brain entries with `memory_list`, fold entries by `goal_id`, and find the latest goal with `state: active`
2. Add a new Brain entry superseding the active one:

```
allura-brain__memory_add({
  group_id: "allura-system",
  content: "GOAL_PAUSED goal_id:[original goal_id] state:paused objective:[original objective] paused_at:[ISO timestamp]",
  metadata: { source: "conversation" }
})
```

3. Print: "Goal paused. Resume with /goal resume [goal-id]"

---

## Subcommand: `resume [goal-id]`

1. Search Brain for paused goal matching goal-id (or most recent paused)
2. Read `ralph/goals/[goal-id].md` to find last completed task
3. Add Brain entry:

```
allura-brain__memory_add({
  group_id: "allura-system",
  content: "GOAL_RESUMED goal_id:[goal_id] state:active resumed_at:[ISO timestamp]",
  metadata: { source: "conversation" }
})
```

4. Do not auto-run. Print: `Goal resumed. Run /goal run [goal-id] to execute one bounded Ralph iteration.`

---

## Subcommand: `run [goal-id]`

1. Resolve the active goal with `memory_list` state folding. If `[goal-id]` is supplied, require that goal.
2. Refuse if `.ralph/ralph-loop.state.json` has `active: true` and `startedAt` is non-empty. Tell the user to inspect or clear stale Ralph state before launching another loop.
3. Read `ralph/PROMPT_plan.md` and the goal plan at `ralph/goals/[goal-id].md`.
4. Launch exactly one bounded iteration:
   ```bash
   ralph --prompt-file ralph/goals/[goal-id].md --max-iterations 1 --completion-promise TASK_COMPLETE
   ```
5. If `ralph` is unavailable, do not fall back to an unbounded loop. Print the command the user should run manually.

---

## Subcommand: `clear [goal-id]`

1. Search Brain for the goal
2. Add superseding entry with `state: "abandoned"`
3. Print: "Goal [goal-id] cleared."

---

## New Objective (default path)

### Step 1 — Conflict Check
List recent Brain entries and fold by goal ID. Do not use semantic search for active-goal detection because newly created goals are episodic:
```
allura-brain__memory_list({ group_id: "allura-system", user_id: "<verified authenticated principal>", limit: 50, sort: "created_at_desc" })
```
If one exists, warn the user:
> "Active goal already running: [objective]. Pause it first with `/goal pause` or provide a different scope."
Stop here unless user explicitly confirms override.

### Step 2 — Elicit Stopping Condition
If `$ARGUMENTS` lacks a verifiable stopping condition (no "until", "when", "all X pass", "checklist complete"), ask ONE clarifying question:

> "How will we know this is done? (e.g. 'all tests pass', 'checklist.md complete', 'feature X ships')"

Wait for answer before proceeding.

### Step 3 — Goal Definition

Extract from `$ARGUMENTS` and the user's answer:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Objective:          [one sentence, imperative mood]
Stopping condition: [verifiable — binary check or test command]
Guardrails:         [what must NOT change]
Ralph plan:         ralph/goals/[goal-id].md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Show this to the user. Wait for sign-off (`y` / `yes` / `go`). Do NOT proceed without confirmation.

### Step 4 — Persist to Brain

Generate a goal ID: `goal-[YYYYMMDD-HHMM]`

```
allura-brain__memory_add({
  group_id: "allura-system",
  content: "GOAL_SET goal_id:[goal-id] state:active objective:[objective] stopping_condition:[stopping condition] guardrails:[guardrails] ralph_plan:ralph/goals/[goal-id].md created_at:[ISO timestamp]",
  metadata: { source: "conversation" }
})
```

### Step 5 — Generate Ralph Plan

Write (or update) `ralph/goals/[goal-id].md`:

```markdown
# Goal: [objective]
**Goal ID:** [goal-id]
**Stopping condition:** [stopping condition]
**Guardrails:** [guardrails]
**Created:** [timestamp]

## Tasks

- [ ] [task 1 — concrete, testable]
- [ ] [task 2]
- [ ] [task 3]
...

## Completion Check

Run: [stopping condition command or description]
```

Decompose the objective into 3–10 concrete tasks. Each task must be:
- Specific enough to implement without asking questions
- Completable with `bun run typecheck && bun test` as verification
- Scoped within the guardrails

### Step 6 — Stop Before Execution

Print:
```
Goal [goal-id] active. Plan written to ralph/goals/[goal-id].md.

  Manage:
    /goal run [goal-id] — execute one bounded Ralph iteration
    /goal status      — check progress
    /goal pause       — suspend
    /goal resume      — continue after pause
    /goal clear       — abandon

  Inject hints before a run:
    ralph --add-context "hint here"
```

---

## Allura Rules (Non-Negotiable)

These apply regardless of subcommand:

1. `group_id = "allura-system"` on every Brain operation
2. Writes use transport-derived identity; list reads use only a verified authenticated principal
3. Never mutate Brain entries — always add superseding entries for state transitions
4. Ralph never modifies task descriptions — only marks tasks `[x]`
5. Stopping condition must be verifiable — binary yes/no, not "looks good"
6. Guardrails are enforced by Ralph — scope violations halt the loop
