---
description: "Long-horizon autonomous goal. /goal <objective> starts execution. /goal status | pause | resume | clear manage lifecycle."
argument-hint: "<objective> | status | pause | resume | clear [goal-id]"
allowed-tools: ["Read", "Write", "Bash", "Glob", "Grep", "mcp__allura-brain__memory_add", "mcp__allura-brain__memory_search", "mcp__allura-brain__memory_list"]
---

# /goal — Long-Horizon Autonomous Objective

You are operating in **Goal Mode** — a long-horizon execution loop that persists state in Allura Brain, decomposes objectives into Ralph-ready tasks, and drives autonomous work without constant human intervention.

## Parse Arguments

`$ARGUMENTS` is one of:
- `status` — show active goal from Brain
- `pause` — suspend current goal
- `resume [goal-id]` — resume a paused goal
- `clear [goal-id]` — abandon a goal
- anything else — treat as a new objective

---

## Subcommand: `status`

1. List recent Brain entries: `allura-brain__memory_list({ group_id: "allura-system", user_id: "brooks-architect", limit: 50, sort: "created_at_desc" })`
2. Filter results where `content` starts with `GOAL:` — memory_search only hits the semantic store; newly created goals are episodic and only appear via memory_list
3. Display:

```
━━━ Active Goals ━━━
[goal-id]  [state]  [created]
  Objective: [content]
  Stopping condition: [from metadata]
  Ralph plan: [ralph_plan path]
━━━━━━━━━━━━━━━━━━━
```

4. If no goals found: print "No active goals. Run /goal <objective> to start one."

---

## Subcommand: `pause`

1. Search Brain for active goal (query: "GOAL state:active")
2. Add a new Brain entry superseding the active one:

```
allura-brain__memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "GOAL:[original objective]",
  metadata: {
    source: "conversation",
    agent_id: "brooks-architect",
    event_type: "GOAL_PAUSED",
    goal_id: [original goal_id],
    state: "paused",
    paused_at: [ISO timestamp]
  }
})
```

3. Print: "Goal paused. Resume with /goal resume [goal-id]"

---

## Subcommand: `resume [goal-id]`

1. Search Brain for paused goal matching goal-id (or most recent paused)
2. Read `ralph/IMPLEMENTATION_PLAN.md` to find last completed task
3. Add Brain entry:

```
allura-brain__memory_add({
  ...
  metadata: { event_type: "GOAL_RESUMED", state: "active", resumed_at: [timestamp] }
})
```

4. Run Ralph loop from current plan state:
   ```bash
   ./ralph/loop.sh build 50
   ```
   (or if loop.sh absent: invoke /ralph build)

---

## Subcommand: `clear [goal-id]`

1. Search Brain for the goal
2. Add superseding entry with `state: "abandoned"`
3. Print: "Goal [goal-id] cleared."

---

## New Objective (default path)

### Step 1 — Conflict Check
Search Brain for existing active goals:
```
allura-brain__memory_search({ query: "GOAL state active", group_id: "allura-system", limit: 3 })
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
Ralph plan:         ralph/IMPLEMENTATION_PLAN.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Show this to the user. Wait for sign-off (`y` / `yes` / `go`). Do NOT proceed without confirmation.

### Step 4 — Persist to Brain

Generate a goal ID: `goal-[YYYYMMDD-HHMM]`

```
allura-brain__memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "GOAL: [objective]",
  metadata: {
    source: "conversation",
    agent_id: "brooks-architect",
    event_type: "GOAL_SET",
    goal_id: "[goal-id]",
    state: "active",
    stopping_condition: "[stopping condition]",
    guardrails: ["[guardrail 1]", "..."],
    ralph_plan: "ralph/IMPLEMENTATION_PLAN.md",
    created_at: "[ISO timestamp]"
  }
})
```

### Step 5 — Generate Ralph Plan

Write (or update) `ralph/IMPLEMENTATION_PLAN.md`:

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

### Step 6 — Launch Ralph Loop

Check if `ralph/loop.sh` exists:
```bash
test -f ralph/loop.sh && echo "exists"
```

If exists:
```bash
./ralph/loop.sh build 50
```

If not exists, invoke the `/ralph build` command instead (single iteration — user will need to run repeatedly, or set up the loop script).

Print:
```
Goal [goal-id] active. Ralph is running.

  Manage:
    /goal status      — check progress
    /goal pause       — suspend
    /goal resume      — continue after pause
    /goal clear       — abandon

  Inject hints mid-run:
    ralph --add-context "hint here"
```

---

## Allura Rules (Non-Negotiable)

These apply regardless of subcommand:

1. `group_id = "allura-system"` on every Brain operation
2. `user_id = "brooks-architect"` for goal entries
3. Never mutate Brain entries — always add superseding entries for state transitions
4. Ralph never modifies `ralph/IMPLEMENTATION_PLAN.md` task descriptions — only marks tasks `[x]`
5. Stopping condition must be verifiable — binary yes/no, not "looks good"
6. Guardrails are enforced by Ralph — scope violations halt the loop
