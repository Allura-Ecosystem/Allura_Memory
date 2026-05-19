# Allura Memory Finish Plan — Current Scope, Blockers, and Closure Gates

> **Date:** 2026-05-16
> **Author:** Brooks (brooks-architect)
> **Status:** GO

## Current Status

Phase 0 is **GO** for final closeout and Phase 1 start.

B04 cash tracker scope is now recorded as out of scope for Phase 0, so it is no
longer an open blocker. Phase 0 closeout is complete.

Decision packet:

- `artifacts/b04-cash-tracker-decision-record-2026-05-17.md`

Final closeout evidence:

- `artifacts/phase0-final-closeout-2026-05-17.md`

## Goal

Finish the Allura Memory System first. Close current P0/P1 review and validation debt. Defer new board work until the memory system is stable.

## Outcome Checklist

| # | Outcome | Status | Evidence |
|---|---------|--------|----------|
| 1 | 2.1 Token Audit closed | DONE | PR #28 / commit `0595f78924ef6ba93baa78238e1421ea1047e8a7`; Notion moved to Done; Brain receipts recorded |
| 2 | /allura review gate closed | WAIVED | Direct evidence green; Ralph runtime waiver `artifacts/allura-ralph-runtime-waiver-2026-05-17.md` |
| 3 | CARD-2.4-E closed | DONE | `artifacts/card-2-4-e-approval-guard-evidence-2026-05-17.md`; `artifacts/card-2-4-e-static-review-substitute-2026-05-17.md`; Notion comments `3631d9be-65b3-817c-8101-001d266fa32e`, `3631d9be-65b3-81de-937e-001ddc698090` |
| 4 | B/C L3 validation closed | DONE | Commit `e75cab8962d6fbfeb31234292f6c863c46109e23` |
| 5 | D-lane rollback closed | DONE | Commit `fbb9cee10d9f65a105a8dbb8e8290e7d731eebf2` |
| 6 | 6420→3334 reachability closed | WAIVED | Direct browser/reachability evidence plus Ralph runtime waiver |
| 7 | Memory Explorer live-data proof | DONE | PR #30 / commit `b6f5aaa001c4a61793949a8c654ca8dd42d3c1a8`; Notion moved to Done; Brain receipts recorded |
| 8 | 3100 target resolved | DONE | PR #33 / commit `999ce78d89580498f6db6685bbe743eb2e7334c8` |
| 9 | Cash tracker resolved | WAIVED | Canonical placeholder/source contract exists; Captain/source owner marked cash tracker out of scope for Phase 0 (`artifacts/b04-cash-tracker-decision-record-2026-05-17.md`). No in-scope Phase 0 cash source is required. |
| 10 | Cost ledger active | DEFERRED | `artifacts/cost-ledger-deferral-2026-05-17.md` |
| 11 | Owner map complete | DONE | Notion owner card records Sabir Asheed as accountable owner for all lanes and Captain acknowledgment received; `OWNERS.yaml` reconciled; Brain receipt `812f4150-3377-47c5-80bf-e99a8f1edcda` |
| 12 | Future boards deferred | DEFERRED | Documented in roadmap; Phase 1 blocked until Phase 0 closes |

## Current Phase 0 Source of Truth — Reconciliation

> **Timestamp:** 2026-05-17 03:20 UTC  
> **Reason:** Fowler identified coherent intent but drift-prone execution: `blocking_list.md` reopened B04/B05 while prior `progress.md` recorded older contract-unblock B04/B05 as PASS, and `/allura` has local evidence but remains `In Review` in Notion. This section is the current Phase 0 blocker model. Older blocker IDs from the `contract_unblock` loop are historical and must not be mixed with this Phase 0 finish plan.

| Phase 0 ID | Status | Source of Truth | Evidence | Closure Rule |
|---|---|---|---|---|
| P0-01 / 2.1 Token Audit | DONE | Notion work item + IRIS Brand review | PR #28 / commit `0595f78924ef6ba93baa78238e1421ea1047e8a7`; Notion moved to Done; Brain receipts `3361ad3a-61b9-43f0-996d-a608c029dd40`, `f5347a2c-84de-4d19-b898-b4e74bf26187`, `2e3d9fe9-10a6-4641-bdda-0a9e057f35ba` | No further action unless Notion is reopened |
| P0-02 / `/allura` review gate | WAIVED | Notion work items + local artifacts | Direct evidence green; Ralph nested runtime blocked by `bwrap`; waiver attached | Supersede waiver with real Ralph rerun if runtime is fixed |
| P0-03 / CARD-2.4-E | DONE | Targeted test + review | Focused tests passed; Notion evidence attached; Brooks-approved static review substitute exists | No further action unless Notion is reopened |
| P0-04 / B/C L3 validation | DONE | Notion work item + git history | Commit `e75cab8962d6fbfeb31234292f6c863c46109e23` records consolidated B1-B7/C1-C2 L3 evidence sweep | No further action unless evidence is reopened |
| P0-05 / D-lane rollback | DONE | Decision log + git history | Commit `fbb9cee10d9f65a105a8dbb8e8290e7d731eebf2` reverted invalid D-lane cutover artifacts | No further action unless D-lane is reopened |
| P0-06 / 6420→3334 reachability | WAIVED | Runtime smoke + Notion card | `http://localhost:3334/allura` evidence green; Ralph nested runtime waived | Supersede waiver with real Ralph rerun if runtime is fixed |
| P0-07 / Memory Explorer live-data | DONE | API + UI evidence | PR #30 / commit `b6f5aaa001c4a61793949a8c654ca8dd42d3c1a8`; root cause fixed in Neo4j `Record` parsing; Notion card `35d1d9be-65b3-81cb-8ad8-c6b903ddd37d`; Brain receipts `4e2b9e18-671f-43c9-97ba-621b31d16731`, `3e2c2eeb-7029-4f66-be16-c654b6cf5788` | No further action unless Notion is reopened |
| P0-08 / 3100 target | DONE | Brooks + Captain decision | PR #33 / commit `999ce78d89580498f6db6685bbe743eb2e7334c8` resolved `3100` as dashboard UI cutover target | Use `3100` only after validated dashboard cutover gates pass |
| P0-09 / Cash tracker | WAIVED | Captain decision + canonical source | Canonical Notion placeholder/source contract exists at `35d1d9be-65b3-810e-b080-eddc7e036aee`; Captain/source owner recorded an out-of-scope decision (`artifacts/b04-cash-tracker-decision-record-2026-05-17.md`); remaining proof is attached in `artifacts/cash-tracker-no-claims-evidence-2026-05-17.md` and prior decision-thread receipts. |
| P0-10 / Cost ledger | DEFERRED | Deferral artifact | `artifacts/cost-ledger-deferral-2026-05-17.md` | Track in Phase 3 Governance And Audit Hardening |
| P0-11 / Owner map | DONE | Notion + Brain + `OWNERS.yaml` | Notion owner card `35b1d9be-65b3-8154-8b26-ea19c288f96f` assigns Sabir Asheed as accountable owner for all lanes and records Captain acknowledgment; `OWNERS.yaml` reconciled; Notion comment `3631d9be-65b3-8127-b86f-001d4b6dc281`; Brain receipt `812f4150-3377-47c5-80bf-e99a8f1edcda` | No further action unless owner map is reopened |
| P0-12 / Future boards | CLOSED-FOR-PHASE-0 | This finish plan | Faith Meats and Lending Compliance deferred | Do not start board config until Phase 0 closes |

### Reconciliation Rules

- `blocking_list.md` now describes **Phase 0 finish blockers**, not the older `contract_unblock` blocker set.
- Older `B04/B05 PASS` statements in `memory-bank/progress.md` refer to the previous `contract_unblock` runtime gate only.
- `/allura` may have local smoke evidence and still remain `In Review` until Notion cards and Ralph/IRIS gates are reconciled.
- Broad closure is **GO**. Phase 1 prep is now unblocked.

## Why We Stalled

| Stall Cause | Impact | Resolution |
|-------------|--------|------------|
| IRIS review timeout | 2.1 Token Audit stuck `In Review` | Resolved by PR #28 / commit `0595f78924ef6ba93baa78238e1421ea1047e8a7` |
| Multi-role review gates | `/allura` waiting on Pike, Fowler, Ralph, IRIS | Parallel dispatch; synthesize |
| 3100 ambiguity | Downstream cutover/parity cards blocked | Resolved: `3100` is the current Docker dashboard and future dashboard UI cutover target |
| Cash tracker missing source | Scope unclear | Canonical Notion source OR mark out of scope |
| Scope drift | Board-config discussions pulled focus from memory closure | Explicit deferral; Phase 0 first |
| Evidence scattered | Notion + artifacts + memory, no single source | This plan + Notion page + Brain logging |
| OpenClaw stalled on review orchestration | Review coordination unclear | Brooks orchestrates; Team RAM executes |

## Teams and Responsibilities

| Team / Agent | Role | Gate |
|--------------|------|------|
| **Brooks** | Chair / Architect / Orchestrator | Synthesis, approval, conceptual integrity |
| **Scout** | Recon + discovery | Context loading, file discovery, risk scan |
| **Woz** | Primary builder | Implementation, tests, diffs |
| **Pike** | Interface gate | API ergonomics, surface area, keyboard/source-of-truth clarity |
| **Fowler** | Refactor gate | Maintainability, lint, typecheck, component boundaries |
| **IRIS Brand** | Brand alignment | Visual audit, token use, brand consistency |
| **TALON** | Technical validation | Test correctness, performance baseline |
| **Hightower** | DevOps | Docker, CI/CD, infrastructure, secrets |
| **Ralph Loop** | Validation | Multi-iteration validation after implementation + review evidence |
| **Captain / Sabir** | Stakeholder | Scope decisions, priority calls |

## Skills

| Skill | When Used |
|-------|-----------|
| `team-ram-cowork` | All Team RAM orchestration |
| `allura-memory-skill` | Governed memory work, Brain reads/writes |
| `bmad-sprint-status` | Sprint/epic status checks |
| `systematic-debugging` | Any bug, test failure, unexpected behavior |
| `code-review` / `bmad-code-review` | Before merge, after implementation |
| `frontend-design` / `frontend-craft` | UI redesign, audit, polish |
| `verification-before-completion` | Before claiming done |
| `open-ralph-wiggum` | Multi-iteration validation loop |

## Research + Governance Sources

This plan uses multiple context sources with explicit responsibilities:

| Source | Use | Output |
|--------|-----|--------|
| **Allura Brain** | Prior decisions, memory-state, blockers, final outcome logging | Ground truth context, outcome records |
| **RuVix** | Governance receipt: mutate, attest, verify, isolate, sandbox, audit | Required receipt for every closure claim |
| **Notion** | Canonical work item status, approvals, evidence, decision records | Updated cards, linked evidence |
| **Tavily** | External/current research: SOC 2, HACCP, mortgage compliance, audit references | Source-backed research notes |
| **Exa** | Secondary external corroboration, broader source discovery | Cross-checks, alternate sources |
| **Context7** | Current library/tool documentation before touching APIs, configs, frameworks, MCP, CLI | API/library receipts before implementation |
| **Local repo search** | Proof of existing implementation before creating or changing anything | File-level implementation plan, risk check |

### Execution Rule

Before any item moves to `Done`, the closure note must include:

```
Evidence sources:
- Notion: <card URL or ID>
- Allura Brain: <memory ID or query result>
- Local validation: <command + result>
- RuVix receipt: <mutate/attest/verify/isolate/sandbox/audit>
- External research, if used: <Tavily/Exa source>
- Context7, if required: <library + finding>
```

## Execution Order

### Step 1: Documentation Sync ✅
- [x] Create `docs/plans/allura-memory-finish-plan.md`
- [x] Update `memory-bank/progress.md`
- [x] Update `blocking_list.md`
- [x] Create Notion page: "Allura Memory Finish Plan — Current Scope, Blockers, and Closure Gates"
- [x] Log planning decision to Allura Brain
- [x] Add Phase 0 source-of-truth reconciliation after Fowler drift warning

### Step 2: Resolve B04 Cash Tracker
- Captain/source owner chooses one valid closure path:
  - populate or link the actual canonical cash tracker source in Notion, or
  - explicitly mark cash tracker out of scope for Phase 0.
- Decision packet: `artifacts/b04-cash-tracker-decision-record-2026-05-17.md`
- No-claims evidence: `artifacts/cash-tracker-no-claims-evidence-2026-05-17.md`

### Step 3: Reconcile B04 Decision
- Update `blocking_list.md`.
- Update `docs/goal.md`.
- Update `docs/plans/phase0-evidence-index.md`.
- Update this finish plan.
- Attach the decision to the B04 Notion work item and finish plan.
- Log the decision to Allura Brain with `group_id = allura-system`.

### Step 4: Record Final Phase 0 Closeout
- Add final Notion closure note.
- Add final Allura Brain receipt.
- Confirm all Phase 0 rows are `DONE`, `DEFERRED`, or `WAIVED`.
- Keep Phase 1 blocked until this closeout exists.

### Step 5: Only Then Start Future Work
After Phase 0 closure:
- Board config system (TypeScript + Zod, dynamic `/boards/[boardId]`, env-only secrets)
- Open-source sanitization (generic board engine + examples, gitignored personal boards)
- Faith Meats Operations Board
- Lending Compliance Board (rules → evidence → decisions → immutable audit trail)

## Deferred Roadmap

| Board | Status | Notes |
|-------|--------|-------|
| **Memory Board** | Current | This is the Allura Memory System we're finishing now |
| **Faith Meats Operations Board** | Deferred | HACCP compliance, operations tracking |
| **Lending Compliance Board** | Deferred | Mortgage lending, rules → evidence → decisions → audit trail |

### Naming Rules
- ✅ Use: `Memory Board`, `Faith Meats Operations Board`, `Lending Compliance Board`
- ❌ Never use: "Dad's thing", hardcoded personal board routes, personal data in public repo

### Open-Source Architecture
- Repo ships: generic board engine + sanitized examples
- Personal boards: gitignored local config (`boards/user/`)
- Board routes: dynamic `/boards/[boardId]`, not hardcoded per vertical
- Compliance engine: domain-agnostic; vertical differences in config/rules, not kernel code

## Decision Log

| Date | Decision | Rationale | Status |
|------|----------|-----------|--------|
| 2026-05-16 | Memory system completion is absolute priority | Vertical board work explicitly deferred | Active |
| 2026-05-16 | Open-source: generic engine + gitignored personal boards | Sanitization for public repo | Active |
| 2026-05-16 | Dynamic board routes `/boards/[boardId]` | No hardcoded vertical routes | Active |
| 2026-05-16 | Compliance engine is domain-agnostic | Vertical differences in config, not code | Active |
| 2026-05-16 | "Dad's thing" → `Lending Compliance Board` | Professional, reusable naming; board remains deferred until owner/source approval | Deferred |
| 2026-05-16 | OpenClaw ↔ Brain bridge confirmed working | Do not list as unfinished | Active |
| 2026-05-17 | `3100` target resolved as dashboard UI cutover target | PR #33 / commit `999ce78d89580498f6db6685bbe743eb2e7334c8` | Active |

## Pending Decisions

| # | Decision | Options | Owner |
|---|----------|---------|-------|
| 1 | Cash tracker scope | Resolved: cash tracker marked out of scope for Phase 0 | Captain/source owner |

## Notion Sync Note

On 2026-05-17, the Notion finish-plan page body was synced from this repo-local
plan after audit found stale planning statuses in Notion. Final Phase 0 closeout
now exists and phase-gate evidence has been recorded.

Receipts:

- Notion finish-plan comment: `3631d9be-65b3-819c-b947-001d9b31fa6d`
- Allura Brain receipt: `081a206b-0266-45d6-8aff-c5aa564e8e26`
