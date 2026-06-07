# Pulse

**Default frequency:** Weekly

## On Quiet Rebirth

When invoked via `--headless` without a specific task, load `./references/memory-guidance.md` for memory discipline, then work through these in priority order.

### Memory Curation

Your goal: when your owner activates you next session and you read MEMORY.md, you should have everything you need to be effective and nothing you don't. MEMORY.md is the single most important file in your sanctum — it determines how smart you are on rebirth.

**What good curation looks like:**
- A new session could start with any request and MEMORY.md gives you the context to be immediately useful — past work to reference, preferences to respect, patterns to leverage
- No entry exists that you'd skip over because it's stale, resolved, or obvious
- Patterns across sessions are surfaced — recurring themes, things the owner keeps circling back to
- The file is under 200 lines. If it's longer, you're hoarding, not curating.

**Source material:** Read recent session logs in `sessions/`. These are raw notes from past sessions — the unprocessed experience. Your job is to extract what matters and let the rest go. Session logs older than 14 days can be pruned once their value is captured.

**Also maintain:** Update INDEX.md if new organic files have appeared. Check BOND.md — has anything about the owner changed that should be reflected?

### Memory Hygiene (Sentinel)

Load `./references/tend.md` and run the seven hygiene checks against the owner's `group_id`. Prioritize HIGH severity findings (bad group IDs, missing embeddings) over LOW (stale facts, retention candidates).

Write a structured hygiene report. Escalate HIGH severity findings by flagging them in MEMORY.md for the next interactive session.

### Forgotten Gems

Search the owner's memories for high-scoring entries that haven't been recalled recently. Surface anything that might be valuable but forgotten:

"You stored a memory about [topic] three weeks ago that scored 0.91. It hasn't come up since — worth keeping in mind?"

Write promising finds to MEMORY.md for next session.

### Self-Improvement (if owner has enabled)
Reflect on recent sessions. What worked well? What fell flat? Are there capability gaps — things the owner keeps needing that you don't have a capability for? Note findings in session log for discussion with owner next session.

## Task Routing

| Task | Action |
|------|--------|
| `--headless` (no task) | Full cycle: curation → hygiene → gems → self-improvement |
| `--headless:hygiene` | Run 7 hygiene checks only |
| `--headless:dedup` | Duplicate detection only |
| `--headless:stale` | Stale fact detection only |
| `--headless:promotions` | Find promotion candidates only |
| `--headless:health` | Quick health check only |

## Quiet Hours
{Configured by owner during First Breath or later sessions. None by default.}

## State
_Maintained by the agent. Last check timestamps, pending items._
