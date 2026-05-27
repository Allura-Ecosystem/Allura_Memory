# Allura Product Principles — BMAD + UX + Governance Alignment

> **Allura remembers because it admits what it forgot.**
> **Allura governs because it shows where it failed.**
> **Allura learns because every mistake leaves a receipt.**
>
> *This is not marketing copy. This is the mechanical truth of the system.*

---

## Table of Contents

1. [The Manifesto](#the-manifesto)
2. [BMAD Integration](#bmad-integration)
3. [UX Principles](#ux-principles)
4. [AI Governance Guidelines](#ai-governance-guidelines)
5. [RuVix Dashboard Gate](#ruvix-dashboard-gate)
6. [Operational Checklist](#operational-checklist)

---

## The Manifesto

### Why This Exists

Most memory systems store what worked. Allura stores what was attempted, what was blocked, and what was learned from the block.

The difference is not technical — it is architectural. Most systems treat errors, rejections, and gaps as implementation details. Allura treats them as product surfaces.

### Three Truths

#### Truth 1: Transparency Is the Architecture

Allura does not have a "debug mode" that reveals hidden internals. Allura's internals are the product. The user sees the same governance layer the kernel enforces. There is no privileged view. There is no admin panel that hides what regular users cannot see.

#### Truth 2: Rejection Is Information

When RuVix blocks a write, that block is not a bug to fix — it is governance in action. The user must see:
- Which policy triggered the block
- What proof was required and why it failed
- What the agent's budget and constraints are
- How to adjust and retry

#### Truth 3: Memory Has Memory

Every memory in Allura carries its full lineage:
- Who proposed it
- Who approved or rejected it
- What version it superseded
- What proof receipts validate it
- When it was last verified

A flat list of "memories" is not enough. Users must be able to follow the thread.

---

## BMAD Integration

### How Each BMAD Phase Validates Transparency

| Phase | BMAD Purpose | Allura Transparency Application |
|-------|-------------|--------------------------------|
| **Phase 1 — Analysis** | Discover what is real | Admit gaps before building. Empty states, missing embeddings, and unknown unknowns are surfaced as findings, not shame. |
| **Phase 2 — Planning** | Define what to build | Document failure modes as requirements. Every plan includes "what could go wrong" and "how the user will know." |
| **Phase 3 — Architecture** | Design how it works | Design for inspection, not just function. Every component must answer: how does a user verify this is working? |
| **Phase 4 — Implementation** | Build what was designed | Every screen shows its reasoning. No action completes without a visible receipt. |

### BMAD Agent Alignment

| Agent | BMAD Phase | Transparency Responsibility |
|-------|-----------|----------------------------|
| **Durham** | Brand strategy, positioning | Defines the voice — "show your work, don't claim perfection" |
| **RAM** | Implementation, architecture | Builds the receipt pipeline — every write must be auditable |
| **TALON** | QA, deploy, runbooks | Verifies that transparency surfaces actually work under load |
| **IRIS** | UX, accessibility, feel | Ensures inspection is usable, not just technically present |
| **Troy** | Governance, audits | Runs the receipts — verifies claims match evidence |

### BMAD Workflow: Finish All Epics

The "Scout-First Kanban" applies transparency principles:

```
Jobs -> Brooks -> Scout -> Woz -> Review Gate -> Allura Memory Log

- Scout investigates before building → admits what is unknown
- Review Gate checks evidence before calling done → surfaces failures
- Allura Memory Log preserves the attempt → learns from mistakes
```

---

## UX Principles

### Derived from the Manifesto

#### 1. Empty States Are Teaching Moments

When a user has zero memories, the dashboard does not say "Nothing here." It says:

> "Your memory is empty. This is normal. Here's how memories are created, what makes them stick, and what governance verifies before they become canonical."

Empty is not broken. Empty is the start of the story.

#### 2. Error States Are Trust-Building Moments

When Neo4j is unavailable, the dashboard does not show a blank screen. It shows:

> "Neo4j connection lost at 14:32 UTC. Your episodic data is safe in PostgreSQL. Here's what happened and when it will retry."

Error without explanation destroys trust. Error with context builds it.

#### 3. Loading States Are Expectation-Setting Moments

When data is fetching, the dashboard shows skeletons with labels:

> "Fetching memories from PostgreSQL..."
> "Verifying graph links in Neo4j..."
> "Loading provenance chain..."

The user knows what is happening and why it takes time.

#### 4. Success States Are Receipt-Generating Moments

When an approval succeeds, the dashboard does not just say "Approved." It shows:

> "Approved at 14:32 UTC by Troy Curator.
> Policy applied: POL-003 (Canonical Promotion Gate).
> Proof: Content score 0.87, no duplicates, agent within budget.
> Next: Syncing to Neo4j as Memory node #1421."

Success without a receipt is assumed. Success with a receipt is verified.

### Screen-by-Screen Transparency Requirements

| Screen | Transparency Requirement |
|--------|-------------------------|
| **Dashboard Overview** | Show live system state (breakers, budgets, pending queue) — not just static stats |
| **Memory List** | Each entry shows: source, approval status, version history link |
| **Memory Detail** | Full provenance chain: proposed → scored → approved → promoted → verified |
| **Approvals Queue** | Show policy that gates each proposal, not just approve/reject buttons |
| **Graph View** | Nodes are clickable to lineage. Edges show relationship type and timestamp |
| **Agents** | Each agent card shows: tools, budget remaining, circuit state, last action |
| **Settings** | Every toggle explains the policy it affects and the consequence of change |
| **Governance** | *(New screen)* Active policies, recent enforcement actions, audit trail |

---

## AI Governance Guidelines

### How Agents Embody the Manifesto

#### Guideline 1: Never Claim a Tool Ran Unless It Ran

**Rule:** If an agent says "I checked" or "I verified," there must be a receipt.

**Enforcement:** RuVix POL-004 — fake tool claims trigger policy violations.

**Example:**
```
❌ Bad: "I checked the database and everything is fine."
✅ Good: "PostgreSQL health check passed at 14:32 UTC. Pool: 12/50 active, 
   0 waiters, latency 8ms p95. Receipt: /api/health/metrics?ts=1716292320"
```

#### Guideline 2: Never Bury a Rejection — Surface It

**Rule:** When a write is blocked by RuVix, the agent must explain why — not just retry.

**Enforcement:** Dashboard must display rejection reasons with policy citations.

**Example:**
```
❌ Bad: "Write failed. Retrying..."
✅ Good: "Write blocked: Budget exhausted for agent 'allura-curator'.
   Limit: 100 writes/day. Current: 100. Policy: BUDGET-001.
   Options: request budget bump, wait for reset (06:00 UTC), or route to 
   another agent."
```

#### Guideline 3: Every Significant Action Gets Logged to Allura

**Rule:** Before calling work "done," write the decision, blocker, and evidence to Allura Brain.

**Enforcement:** `bmad-artifact-memory-importer` flags memory candidates. Troy audits for missing logs.

**Example:**
```
Before: "Dashboard migration is done."
After: "Dashboard migration complete. Decision: Option A (wire HTML to APIs).
   Rationale: faster MVP, preserves 6420 design. Risks: auth gap, two codebases.
   Next: add Clerk gate, incremental Next.js migration."
```

#### Guideline 4: Audit After Important Work

**Rule:** Every session ending with a significant action must produce an audit summary.

**Enforcement:** Troy runs `audit governance` on session close. Missing audits are flagged.

**Example:**
```
## Troy Curator — Session Audit
- Actions: approved 3 proposals, fixed 1 bug, drafted 1 doc
- Decisions: chose Option A for dashboard migration
- Risks: auth gap on HTML dashboard
- Next: fix getNeo4jDriver bug, wire dashboard APIs
```

#### Guideline 5: Separate Perspective from Runtime

**Rule:** Persona-based thinking is allowed. Persona-based false claims are not.

**Enforcement:** If an agent speaks as "Brooks" or "Sally," it must not imply a real subagent executed unless it did.

**Example:**
```
❌ Bad: "As Brooks, I recommend..." (implies Brooks agent ran)
✅ Good: "Speaking with a Brooks-style lens: the risk is..." (clearly perspective only)
```

---

## RuVix Dashboard Gate

### What This Means

The RuVix Dashboard Gate (`RUVIX-DASHBOARD-GATE.md`) is the policy layer that ensures:

1. **Every write through the dashboard is RuVix-gated**
   - Add Memory → goes through proof validation before PostgreSQL
   - Approve Proposal → goes through curator pipeline before Neo4j
   - Forget Memory → requires explicit proof + HITL confirmation

2. **Every read from the dashboard is scope-respected**
   - `group_id` invariant enforced on every query
   - Workspace isolation visible in UI at all times
   - Budget exhaustion surfaced before write attempts

3. **Every state change leaves an audit receipt**
   - Circuit breaker trips → visible in UI with timestamp and threshold
   - Budget breaches → visible with limit and current usage
   - Policy changes → visible in governance log with actor and rationale

### Dashboard Write States

Every write action in the UI must handle these states:

```
Idle → Pending → Success
              → Rejected by RuVix (proof failed)
              → Rejected by Budget (limit hit)
              → Rejected by Circuit Breaker (system-wide halt)
              → Rejected by Policy (policy violation)
```

### Required Dashboard Surfaces

| Surface | Current Status | Gap |
|---------|---------------|-----|
| Circuit breaker indicator | ✅ Live in `budget-card.tsx` | Missing: threshold explanation |
| Budget exhaustion warning | ⚠️ Partial | Missing: per-agent budget display |
| Approval queue | ✅ Live in `builder/page.tsx` | Missing: policy citation per proposal |
| Auto-approve config | ✅ Live in `settings/page.tsx` | Missing: policy that governs threshold |
| Governance log | ❌ Not built | **High priority** — shows active policies and enforcement |
| Agent contracts | ❌ Not built | **High priority** — per-agent rules, tools, constraints |
| Memory lineage | ❌ Not built | **Medium priority** — SUPERSEDES chain in UI |
| Proof receipts | ❌ Not built | **High priority** — RuVix audit trail per action |

---

## Operational Checklist

### Before Calling Any Dashboard Feature "Done"

- [ ] Does the feature show its work? (receipts, provenance, reasoning)
- [ ] Does the feature handle empty states as teaching moments?
- [ ] Does the feature handle error states with context, not silence?
- [ ] Does the feature load with expectation-setting skeletons?
- [ ] Does every write action surface the RuVix gate that governed it?
- [ ] Does every read respect `group_id` isolation and show it in the UI?
- [ ] Is there an audit log entry for significant actions?
- [ ] Did Troy run the receipts and verify evidence?
- [ ] Did the Captain approve before merge?

### BMAD Alignment Check

- [ ] Phase 1: Did we admit gaps before building?
- [ ] Phase 2: Did we document failure modes as requirements?
- [ ] Phase 3: Did we design for inspection, not just function?
- [ ] Phase 4: Does the implementation show its reasoning?

---

## Version

- **v1.0** — 2026-05-21 — Drafted by Troy Curator with Captain approval
- **Source of truth:** `docs/allura/BRAND-MANIFESTO.md`
- **Notion sync:** Pending via `notion-sync.ts` pipeline
- **BMAD alignment:** Validated against `bmad-method-adapter` Phase 1–4 mapping

---

*"Allura remembers because it admits what it forgot. Allura governs because it shows where it failed. Allura learns because every mistake leaves a receipt."*

*This is the product. This is the architecture. This is the work.*
