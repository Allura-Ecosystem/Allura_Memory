---
description: "Allura long-horizon goal. /allura:alluragoal <objective> starts autonomous execution. Subcommands: status | pause | resume | clear"
argument-hint: "<objective> | status | pause | resume | clear [goal-id]"
allowed-tools: ["Read", "Write", "Bash", "Glob", "Grep", "mcp__allura-brain__memory_add", "mcp__allura-brain__memory_list", "mcp__allura-brain__memory_search"]
---

# /allura:alluragoal — Long-Horizon Autonomous Goal

You are operating in **Allura Goal Mode** — a long-horizon execution loop that:
- Persists goal state in **Allura Brain** (survives session restarts)
- Decomposes the objective into a **Ralph-ready task plan**
- Drives autonomous work via **`ralph/loop.sh`** without constant human intervention
- Requires a **verifiable stopping condition** before any execution begins

## Parse Arguments

`$ARGUMENTS` is one of:
- `status` — show all active/paused goals from Brain
- `pause` — suspend the current active goal
- `resume [goal-id]` — resume a paused goal (most recent if no id given)
- `clear [goal-id]` — abandon a goal
- anything else — treat as a new objective

---

## Subcommand: `status`

1. Fetch Brain: `allura-brain__memory_list({ group_id: "allura-system", user_id: "brooks-architect", limit: 50, sort: "created_at_desc" })`
2. Filter entries where `content` starts with `GOAL:`
3. For each, show the most recent entry per `goal_id` (that reflects current state):

```
━━━ Allura Goals ━━━

[goal-id]  [state]  [created_at]
  Objective : [content without "GOAL: " prefix]
  Stops when: [metadata.stopping_condition]
  Plan      : [metadata.ralph_plan]

━━━━━━━━━━━━━━━━━━━
```

4. If none found: "No goals tracked. Run `/allura:alluragoal <objective>` to start one."

---

## Subcommand: `pause`

1. `allura-brain__memory_list(...)` → find most recent `GOAL:` entry with `state: active`
2. Write superseding entry:

```
allura-brain__memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "GOAL: [original objective]",
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
2. Read `ralph/IMPLEMENTATION_PLAN.md` — identify last `[x]` task to know where to pick up
3. Write resumed entry to Brain:

```
allura-brain__memory_add({
  ...metadata: { event_type: "GOAL_RESUMED", state: "active", resumed_at: "[timestamp]" }
})
```

4. Resume Ralph:
   ```bash
   ./ralph/loop.sh build 50
   ```
   Fall back to `/ralph build` if `loop.sh` is absent.

5. Output:
```
Goal [goal-id] resumed from task [N].
Ralph is running — /allura:alluragoal status to check progress.
```

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

Filter for `GOAL:` entries. If the most recent entry for any goal has `state: active`, warn:

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
Ralph plan       : ralph/IMPLEMENTATION_PLAN.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Wait for `y` / `yes` / `go` before touching anything.**

### 4 — Persist to Brain

Goal ID: `goal-[YYYYMMDD-HHMM]`

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
    guardrails: ["[guardrail 1]"],
    ralph_plan: "ralph/IMPLEMENTATION_PLAN.md",
    created_at: "[ISO timestamp]"
  }
})
```

### 5 — Write Ralph Plan

Write `ralph/IMPLEMENTATION_PLAN.md`:

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

### 6 — Launch

```bash
test -f ralph/loop.sh && ./ralph/loop.sh build 50 || echo "loop.sh missing — run /ralph build manually"
```

Output after launch:
```
━━━ Goal Active ━━━
ID    : [goal-id]
Stops : [stopping condition]
Plan  : ralph/IMPLEMENTATION_PLAN.md

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
