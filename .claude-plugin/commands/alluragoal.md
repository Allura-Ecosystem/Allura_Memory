---
description: "Allura long-horizon goal. /allura:alluragoal <objective> defines a goal. run [goal-id] executes one bounded Ralph iteration. Subcommands: status | run | pause | resume | clear"
argument-hint: "<objective> | run [goal-id] | status | pause | resume | clear [goal-id]"
allowed-tools: ["Read", "Write", "Bash", "Glob", "Grep", "mcp__allura-brain__memory_add", "mcp__allura-brain__memory_list", "mcp__allura-brain__memory_search"]
---

# /allura:alluragoal — Long-Horizon Autonomous Goal

You are operating in **Allura Goal Mode** — a long-horizon execution loop that:
- Persists goal state in **Allura Brain** (survives session restarts)
- Decomposes the objective into a **Ralph-ready task plan**
- Drives autonomous work through explicit, bounded `run` invocations rather than auto-launching an unbounded loop
- Requires a **verifiable stopping condition** before any execution begins

## Parse Arguments

`$ARGUMENTS` is one of:
- `status` — show all active/paused goals from Brain
- `run [goal-id]` — execute one bounded Ralph iteration for the active goal
- `pause` — suspend the current active goal
- `resume [goal-id]` — resume a paused goal (most recent if no id given)
- `clear [goal-id]` — abandon a goal
- anything else — treat as a new objective

---

## Subcommand: `status`

1. Fetch Brain: `allura-brain__memory_list({ group_id: "allura-system", user_id: "brooks-architect", limit: 50, sort: "created_at_desc" })`
2. Filter entries where `content` starts with `GOAL_`
3. For each, show the most recent entry per `goal_id` (that reflects current state):

```
━━━ Allura Goals ━━━

[goal-id]  [state]  [created_at]
  Objective : [objective field from GOAL_* content or metadata]
  Stops when: [metadata.stopping_condition]
  Plan      : [metadata.ralph_plan]

━━━━━━━━━━━━━━━━━━━
```

4. If none found: "No goals tracked. Run `/allura:alluragoal <objective>` to start one."

---

## Subcommand: `pause`

1. `allura-brain__memory_list(...)` → find most recent `GOAL_` entry with `state: active`
2. Write superseding entry:

```
allura-brain__memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "GOAL_PAUSED [original goal_id] state:paused objective: [original objective]",
  metadata: {
    source: "conversation",
    agent_id: "brooks-architect",
    event_type: "GOAL_PAUSED",
    goal_id: "[original goal_id]",
    state: "paused",
    paused_at: "[ISO timestamp]"
  }
})
```

3. Output: `Goal [goal-id] paused. Resume with /allura:alluragoal resume [goal-id]`

---

## Subcommand: `resume [goal-id]`

1. Find most recent paused goal from Brain (filter `state: paused`, match goal-id if given)
2. Read `ralph/goals/[goal-id].md` — identify last `[x]` task to know where to pick up
3. Write resumed entry to Brain:

```
allura-brain__memory_add({
  ...metadata: { event_type: "GOAL_RESUMED", state: "active", resumed_at: "[timestamp]" }
})
```

4. Do not auto-run. Output: `Goal [goal-id] resumed. Run /allura:alluragoal run [goal-id] to execute one bounded Ralph iteration.`

5. Output:
```
Goal [goal-id] resumed from task [N].
Run /allura:alluragoal run [goal-id] when ready to execute one bounded Ralph iteration.
```

---

## Subcommand: `run [goal-id]`

1. Find the active goal from Brain using `memory_list` state folding. If `[goal-id]` is supplied, require that goal.
2. Refuse if `.ralph/ralph-loop.state.json` has `active: true` and `startedAt` is non-empty. Tell the user to inspect or clear stale Ralph state before launching another loop.
3. Read `ralph/PROMPT_plan.md` and the goal plan at `ralph/goals/[goal-id].md`.
4. Launch exactly one bounded iteration:
   ```bash
   ralph --prompt-file ralph/goals/[goal-id].md --max-iterations 1 --completion-promise TASK_COMPLETE
   ```
5. If `ralph` is unavailable, do not fall back to an unbounded loop. Print the command the user should run manually.

---

## Subcommand: `clear [goal-id]`

1. Find the goal in Brain
2. Write abandoned entry: `state: "abandoned"`
3. Output: `Goal [goal-id] cleared.`

---

## New Objective (default path)

### 1 — Conflict Check

```
allura-brain__memory_list({ group_id: "allura-system", user_id: "brooks-architect", limit: 50 })
```

Filter for `GOAL_` entries. If the most recent entry for any goal has `state: active`, warn:

> "Active goal already running: **[objective]**
> Pause it first with `/allura:alluragoal pause` or confirm you want to run both."

Stop unless user confirms.

### 2 — Stopping Condition Gate

If `$ARGUMENTS` contains none of: "until", "when", "all X pass", "checklist", "zero errors", "complete", ask exactly ONE question:

> "How will we know this is done? (e.g. `bun test` passes, checklist.md complete, feature ships)"

Do not proceed without the answer.

### 3 — Goal Definition (sign-off required)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALLURA GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Objective        : [one sentence, imperative mood]
Stops when       : [verifiable — command output, binary check]
Guardrails       : [what must NOT change]
  Ralph plan       : ralph/goals/[goal-id].md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Wait for `y` / `yes` / `go` before touching anything.**

### 4 — Persist to Brain

Goal ID: `goal-[YYYYMMDD-HHMM]`

```
allura-brain__memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "GOAL_SET [goal-id] state:active objective: [objective]",
  metadata: {
    source: "conversation",
    agent_id: "brooks-architect",
    event_type: "GOAL_SET",
    goal_id: "[goal-id]",
    state: "active",
    stopping_condition: "[stopping condition]",
    guardrails: ["[guardrail 1]"],
    ralph_plan: "ralph/goals/[goal-id].md",
    created_at: "[ISO timestamp]"
  }
})
```

### 5 — Write Ralph Plan

Write `ralph/goals/[goal-id].md`:

```markdown
# Goal: [objective]
**Goal ID:** [goal-id]
**Stopping condition:** [stopping condition]
**Guardrails:** [guardrails]
**Created:** [timestamp]

## Tasks

- [ ] [task 1 — concrete, verifiable]
- [ ] [task 2]
- [ ] [task 3]

## Completion Check

[stopping condition command or manual check]
```

Rules for task decomposition:
- 3–10 tasks max
- Each task is completable in one Ralph iteration
- Each task has an implicit verification: `bun run typecheck && bun test`
- No task touches what's listed in guardrails

### 6 — Stop Before Execution

Do not auto-launch Ralph from goal creation. Execution is explicit through `/allura:alluragoal run [goal-id]`.

Output after launch:
```
━━━ Goal Active ━━━
ID    : [goal-id]
Stops : [stopping condition]
Plan  : ralph/goals/[goal-id].md

  /allura:alluragoal run      — execute one bounded Ralph iteration
  /allura:alluragoal status   — check progress
  /allura:alluragoal pause    — suspend
  /allura:alluragoal resume   — continue
  /allura:alluragoal clear    — abandon

  Mid-run hint injection:
  ralph --add-context "your hint here"
━━━━━━━━━━━━━━━━━━━
```

---

## Non-Negotiable Rules

1. `group_id = "allura-system"` on every Brain call — never omit
2. `user_id = "brooks-architect"` for all goal entries
3. Brain entries are **append-only** — never mutate, always add superseding entries
4. Ralph task descriptions are **immutable** — only `[ ]` → `[x]` is allowed
5. Stopping condition must be **binary verifiable** — not "looks good"
6. Guardrails are **hard limits** — Ralph halts if scope is exceeded
7. **bun only** — never npm/npx inside the Ralph plan
