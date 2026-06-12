# Patch: brooks.md Startup Protocol (replace the "## Startup Protocol (MANDATORY)" section)

In `.claude/agents/brooks.md`, replace everything from `## Startup Protocol (MANDATORY)`
up to (not including) `## Command Menu` with:

---

## Startup Protocol (MANDATORY)

**Before greeting the user, dispatch Scout to hydrate from the Brain — DUAL-PASS, one parallel batch:**

### Call Batch 1: Scout Recon — Dual-Pass Hydration (all calls in parallel)

Scout owns startup hydration. Scout must run, in a single parallel batch:

**Pass A — Health (stall early-warning):**
```
allura-brain_audit_health_report({ group_id: "allura-system" })
```

**Pass B — Promoted truth (semantic/graph):**
```
allura-brain_memory_search({ query: "active tasks blockers architecture decisions", group_id: "allura-system", limit: 10 })
allura-brain_memory_search({ query: "recent outcomes lessons patterns", group_id: "allura-system", limit: 5 })
```

**Pass C — Current truth (episodic, last 48h, FILTERED):**
```
allura-brain_audit_query_events({ group_id: "allura-system", event_type: "memory_add", date_range: { from: <now-48h> }, limit: 10 })
allura-brain_audit_query_events({ group_id: "allura-system", event_type: "ARCHITECTURE_DECISION", date_range: { from: <now-48h> }, limit: 5 })
allura-brain_audit_query_events({ group_id: "allura-system", event_type: "BLOCKER", date_range: { from: <now-7d> }, limit: 5 })
```
Never query events unfiltered at boot — process_* test events drown the signal.

### Staleness Rule (MANDATORY)

If the newest Pass-B hit is older than 7 days, OR curator queue depth > 100:
the Scout Report MUST open with **"⚠ graph stale — trusting episodic"** and state
must be derived from Pass C, with Pass B used only for durable principles.
Where Pass B and Pass C conflict, Pass C wins; flag the conflict for promotion triage.

### Bootstrap File Rule

`_bootstrap.md` System State is an UNTRUSTED HINT. Never assert it as fact.
If it diverges from the hydration batch, say so in the Scout Report.

### Call 2: Log Session Start (AFTER synthesis, not before)

Write the synthesized state — not a placeholder:
```javascript
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "Session start <date>. Synthesized state: <active> / <blockers> / <last decisions>. Staleness: <graph fresh|stale>.",
  metadata: { source: "conversation", agent_id: "brooks-architect", event_type: "session_start" }
})
```

**Only after the Scout Report is synthesized, present the greeting and command menu.**

---

Rationale (2026-06-12): graph-only hydration returned 7-week-stale state while 242
proposals sat in the HITL queue. Episodic recency + staleness flag makes boot honest
under promotion stall. Receipt: Brain memory 8ece0761-3121-4d51-9fa3-b2e6a0811a18.
