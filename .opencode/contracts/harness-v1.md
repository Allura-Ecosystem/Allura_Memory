# Minimum Bootable Harness Contract (v1)

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

This contract defines the minimum viable harness for deterministic multi-agent orchestration. It specifies the commands, routing policy, and logging contract required to execute tasks in both DAY_BUILD and NIGHT_BUILD modes.

---

## 1. DAY_BUILD Command

**Command:** `opencode run --mode=day`

**Behavior:**
- Interactive execution with approval gates
- Stops on ambiguous routing (asks user)
- Logs all events to Postgres
- Validates each step before proceeding

**Entrypoint:** `.opencode/command/run-day.md`

**Validation:**
```bash
opencode run --mode=day --task="test scout"
# Expected: ContextScout invoked, report generated, approval requested
```

**Execution Flow:**
1. Load AI-GUIDELINES.md as required context
2. Invoke ContextScout to produce Scout Report
3. Invoke Jobs to produce scope and acceptance criteria
4. Request approval from user
5. If approved, invoke Brooks to produce Contracts/ADRs
6. Request approval from user
7. If approved, invoke Woz to implement step-by-step
8. Invoke Pike and Fowler for interface, readability, and refactor safety checks
9. Invoke Fowler to prevent debt
10. Validate documentation completeness
11. Log TASK_COMPLETE

---

## 2. NIGHT_BUILD Command

**Command:** `opencode run --mode=night`

**Behavior:**
- No-brakes execution (no clarifying questions unless destructive)
- Picks best-known route immediately
- Executes → validates → continues
- Stops ONLY on: hard blocker, explicit user stop, or DoD satisfied

**Entrypoint:** `.opencode/command/run-night.md`

**Validation:**
```bash
opencode run --mode=night --task="fix lint errors"
# Expected: Woz invoked, fixes applied, validation run, no approval needed
```

**Execution Flow:**
1. Load AI-GUIDELINES.md as required context
2. Invoke ContextScout to produce Scout Report
3. Invoke Jobs to produce scope and acceptance criteria
4. Invoke Brooks to produce Contracts/ADRs + select route
5. Invoke Woz to implement step-by-step with validations
6. Invoke Pike and Fowler to reject unnecessary surface area
7. Invoke Fowler to prevent debt
8. Invoke Bellard or Carmack (only if perf constraint)
9. Validate documentation completeness
10. Log TASK_COMPLETE

---

## 3. Deterministic Routing Policy (v1)

**Rule:** Choose ONE best route based on Performance Log + role constraints.

### Routing Table

| Task Type | Primary Agent | Fallback Agent | Condition |
|-----------|---------------|----------------|-----------|
| Discovery | ContextScout | None | Always |
| Intent/Scope | Jobs | None | Always |
| Architecture | Brooks | None | Always |
| Implementation | Woz | Fowler (if interface added) | Always |
| Refactor | Fowler | Woz | Always |
| Performance | Bellard | Carmack | Only if perf constraint |
| Validation | Pike | Fowler | Always |

### Fallback Logic

```
function selectFallbackAgent(taskType, primaryAgent, error):
    fallbackAgent = routingTable[taskType].fallbackAgent
    
    if fallbackAgent is None:
        log BLOCKER_HIT (reason="No fallback agent for task type")
        return Brooks  // Escalate to architect
    
    if error is "Agent exceeded authority":
        log BLOCKER_HIT (reason="Authority violation")
        return Brooks  // Escalate to architect
    
    if error is "Agent failed validation":
        log FALLBACK_TRIGGERED (from=primaryAgent, to=fallbackAgent)
        return fallbackAgent
    
    return fallbackAgent
```

### Conflict Resolution

- **Performance evidence inconclusive** → Brooks decides
- **Architecture ambiguous** → Brooks decides
- **Destructive decision required** → Brooks must approve

---

## 4. Performance Logging Event Schema (v1)

**Table:** `events`

**Columns:**
```sql
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  group_id VARCHAR(100) NOT NULL,
  agent_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Event Types:**
- `TASK_START`
- `TASK_COMPLETE`
- `TASK_FAILED`
- `AGENT_INVOKED`
- `AGENT_COMPLETED`
- `AGENT_FAILED`
- `FALLBACK_TRIGGERED`
- `BLOCKER_HIT`
- `APPROVAL_REQUESTED`
- `APPROVAL_GRANTED`
- `APPROVAL_DENIED`
- `DOC_COMPLIANCE_CHECK`

**Logging Contract:**
- Every agent invocation MUST log `AGENT_INVOKED` + `AGENT_COMPLETED` or `AGENT_FAILED`
- Every task MUST log `TASK_START` + `TASK_COMPLETE` or `TASK_FAILED`
- Fallbacks MUST log `FALLBACK_TRIGGERED`
- Blockers MUST log `BLOCKER_HIT`
- Documentation compliance MUST log `DOC_COMPLIANCE_CHECK`

**Performance Logging (must include doc adherence):**
Every run logs:
- `task_type` — Category of work
- `route_selected` — Primary + fallback chain
- `outcome` — success/fail/stuck
- `latency_metrics` — TTFP, TTFVC, TTDOD
- `doc_compliance`:
  - `guidelines_loaded`: yes/no
  - `required_artifacts_present`: pass/fail + missing list
  - `traceability_updated`: pass/fail
  - `adr_written_if_needed`: yes/no/not-applicable

**Validation:**
```bash
# Check if logging works
psql -d allura -c "SELECT COUNT(*) FROM events WHERE agent_id = 'contextscout';"
# Expected: > 0 after smoke test
```

---

## 5. Documentation Compliance Gate

**Rule:** All agents MUST load `.opencode/AI-GUIDELINES.md` as required context before execution. This is not "nice to have." It is a routing gate, a logging signal, and part of Definition of Done.

**Compliance Rules (hard gates):**
1. No agent may produce a "final" plan without confirming AI-GUIDELINES.md was loaded
2. DoD MUST include documentation artifacts validation
3. Performance logging MUST include documentation adherence signals
4. Any work that creates/changes behavior MUST update traceability artifacts (requirements + risks/decisions) per AI-GUIDELINES

**Required Artifacts (canonical location: `docs/allura/`):**
1. `BLUEPRINT.md` — Single source of design intent
2. `SOLUTION-ARCHITECTURE.md` — Topological view
3. `DESIGN-ALLURA.md` (or approved `DESIGN-<AREA>.md`) — Functional design
4. `REQUIREMENTS-MATRIX.md` — Requirements traceability
5. `RISKS-AND-DECISIONS.md` — Architectural decisions and risks
6. `DATA-DICTIONARY.md` — Field-level reference

**Canonical Surface Rule:** No net-new files may be created under `docs/allura/` unless they are one of the six canonical document types above. All other artifacts go to `docs/archive/allura/`, `memory-bank`, or Allura Brain.

**DOC COMPLIANCE GATE (always-on):**
Before any agent marks a task complete, it must output:
- AI-GUIDELINES.md loaded? (yes/no)
- Which required artifacts were created/updated? (list)
- Requirements Matrix updated? (yes/no)
- Risks & Decisions updated? (yes/no)

If any answer is "no", the task is not complete and must continue.

**Validation:**
```bash
# Check if canonical artifacts exist
ls -1 docs/allura/BLUEPRINT.md docs/allura/SOLUTION-ARCHITECTURE.md docs/allura/DESIGN-ALLURA.md docs/allura/REQUIREMENTS-MATRIX.md docs/allura/RISKS-AND-DECISIONS.md docs/allura/DATA-DICTIONARY.md
# Expected: All files listed

# Check if AI-GUIDELINES.md exists
ls -1 .opencode/AI-GUIDELINES.md
# Expected: File exists
```

---

## 6. Quick Start

### DAY_BUILD Mode (Interactive)

```bash
# Submit a task in DAY_BUILD mode
opencode run --mode=day --task="create hello world file"

# Expected flow:
# 1. ContextScout produces Scout Report
# 2. Jobs produces scope and acceptance criteria
# 3. User approves
# 4. Brooks produces Contracts/ADRs
# 5. User approves
# 6. Woz implements
# 7. Pike validates
# 8. Fowler prevents debt
# 9. Documentation validated
# 10. TASK_COMPLETE logged
```

### NIGHT_BUILD Mode (No Brakes)

```bash
# Submit a task in NIGHT_BUILD mode
opencode run --mode=night --task="fix lint errors"

# Expected flow:
# 1. ContextScout produces Scout Report
# 2. Jobs produces scope and acceptance criteria
# 3. Brooks produces Contracts/ADRs + selects route
# 4. Woz implements
# 5. Pike validates
# 6. Fowler prevents debt
# 7. Documentation validated
# 8. TASK_COMPLETE logged
# No approvals needed unless destructive change
```

---

## 7. Validation Checklist

Before considering the harness "bootable," validate:

- [ ] **Upstream remote configured** — `git remote -v` shows both `origin` and `upstream`
- [ ] **DAY_BUILD command works** — `opencode run --mode=day --task="test scout"` succeeds
- [ ] **NIGHT_BUILD command works** — `opencode run --mode=night --task="fix lint errors"` succeeds
- [ ] **Performance logging works** — `SELECT COUNT(*) FROM events WHERE agent_id = 'contextscout';` returns > 0
- [ ] **Documentation complete** — All 7 artifacts exist and are valid
- [ ] **Routing policy enforced** — Tasks route to correct agents based on task type
- [ ] **Fallback routing works** — Primary agent failure triggers fallback agent
- [ ] **AI-GUIDELINES.md loaded** — All agents confirm `.opencode/AI-GUIDELINES.md` loaded before execution

## 8. Definition of Done (DoD)

A run is NOT DONE unless:

- [ ] **Acceptance criteria pass** — All testable conditions satisfied
- [ ] **Smoke tests pass** — Harness runnable
- [ ] **Documentation artifacts exist** — All required artifacts present
- [ ] **Requirements Matrix updated** — References relevant design docs/routes
- [ ] **Risks & Decisions updated** — Significant decisions documented
- [ ] **Performance log entry recorded** — Includes doc adherence signals
- [ ] **AI-GUIDELINES.md loaded** — Confirmed before execution
- [ ] **DOC COMPLIANCE GATE passed** — All compliance questions answered "yes"

---

## 8. References

- [BLUEPRINT.md](../../docs/allura/BLUEPRINT.md) — Single source of design intent
- [SOLUTION-ARCHITECTURE.md](../../docs/allura/SOLUTION-ARCHITECTURE.md) — Topological view
- [DESIGN-ALLURA.md](../../docs/allura/DESIGN-ALLURA.md) — Functional design
- [REQUIREMENTS-MATRIX.md](../../docs/allura/REQUIREMENTS-MATRIX.md) — Requirements traceability
- [RISKS-AND-DECISIONS.md](../../docs/allura/RISKS-AND-DECISIONS.md) — Architectural decisions and risks
- [DATA-DICTIONARY.md](../../docs/allura/DATA-DICTIONARY.md) — Field-level reference
- [AI-GUIDELINES.md](../AI-GUIDELINES.md) — Documentation standards
