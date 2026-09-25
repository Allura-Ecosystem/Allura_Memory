> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

---
title: "Epic 29 — Implementation Readiness Assessment"
type: implementation-readiness
epic: 29
created: "2026-09-08"
verdict: GO-WITH-CONDITIONS
block_count: 0
high_count: 0
med_count: 1
low_count: 1
assessor: Brooks (sprint planning gate)
sources:
  - _bmad/bmm/planning/epic-29-desktop-device-pairing-and-persistent-authentication.md
  - _bmad/bmm/planning/epic-29-work-packages.md
  - _bmad/bmm/stories/29-*.md (21 files)
  - _bmad-output/specs/spec-desktop-device-pairing/SPEC.md
  - _bmad-output/specs/spec-desktop-device-pairing/STATE-MACHINE.md
  - _bmad-output/specs/spec-desktop-device-pairing/THREAT-MODEL.md
  - _bmad-output/planning-artifacts/epic-29-desktop-device-pairing-architecture.md (rev 4)
  - _bmad-output/planning-artifacts/epic-29-architecture-final-review.md
  - _bmad/bmm/stories/sprint-status.yaml
  - ralph/goals/goal-20260908-2034.md
---

# Epic 29 — Implementation Readiness Assessment

## Executive Summary

**Verdict: GO-WITH-CONDITIONS**

Epic 29 — Desktop Device Pairing and Persistent Authentication — has a complete, internally consistent planning package. All 21 stories exist and are in backlog status. The architecture is approved-for-stories (revision 4, 0 BLOCK / 0 HIGH). The dependency DAG is acyclic and backward-only. B1/B2 are correctly identified as implementation prerequisites, not completed evidence. The goal stopping condition aligns with the epic plan.

The sole condition for GO is that **MED-1** (grace_exchange_count already added in architecture revision 4, but the implementing story must verify the column exists and is wired) and **LOW-1** (sprint-status.yaml WP1 status should transition to `pending` or `done` once this gate passes; currently `in-progress` with no stories started) are tracked and resolved during implementation. Neither blocks Story 29.1 start.

---

## 1. Requirements Coverage

### 1.1 AC-to-Story Traceability

| AC | Lead Story | Architecture Evidence | Status |
|---|---|---|---|
| AC-01 | 29.6 | §4.1-4.2b, §16.1 | ✅ mapped |
| AC-02 | 29.5 | §4.2 step 5-6, §5.1 | ✅ mapped |
| AC-03 | 29.9 | §4.3-4.5 | ✅ mapped |
| AC-04 | 29.11 | §9.3, §6, §10.1 | ✅ mapped |
| AC-05 | 29.11 | §10.2, §4.7, SPEC §2 | ✅ mapped |
| AC-06 | 29.6 | §3.1/3.1b, §9 | ✅ mapped |
| AC-07 | 29.4 | §4.1, §3.1 | ✅ mapped |
| AC-08 | 29.6 | §4.2b, §8.2, AD-65 | ✅ mapped |
| AC-09 | 29.6 | §4.4, §3.3, AD-64 | ✅ mapped |
| AC-10 | 29.5 | §4.2c | ✅ mapped |
| AC-11 | 29.9 | §5.1 | ✅ mapped |
| AC-12 | 29.8 | §5.4, consistency fix L | ✅ mapped |
| AC-13 | 29.9 | §5.5 | ✅ mapped |
| AC-14 | 29.8 | §5.2 | ✅ mapped |
| AC-15 | 29.10 | §3.2, §4.5, §11.1 | ✅ mapped |
| AC-16 | 29.13 | §6, §4.6 | ✅ mapped |
| AC-17 | 29.12 | §6.4 | ✅ mapped |
| AC-18 | 29.13 | §6.4, §4.6, MED-F6 | ✅ mapped |
| AC-19 | 29.13 | §6.3 | ✅ mapped |
| AC-20 | 29.19 | §4.5, §3.2 | ✅ mapped |
| AC-21 | 29.13 | §6.3 | ✅ mapped |
| AC-22 | 29.15 | §4.7, §7, AD-66 | ✅ mapped |
| AC-23 | 29.15 | §3.1b CHECK, §4.7 | ✅ mapped |
| AC-24 | 29.16 | §11.1 | ✅ mapped |
| AC-25 | 29.17 | §11.2 | ✅ mapped |
| AC-26 | 29.18 | §12.2 | ✅ mapped |
| AC-27 | 29.19 | §12.3 | ✅ mapped |
| AC-28 | 29.20 | §12.4 | ⚠️ B1 |
| AC-29 | 29.21 | §9.2, §12.5 | ⚠️ B2 |

**Result:** All 29 ACs have architecture mapping and implementation story leads. AC-01 through AC-27 can be evidenced in this repository; AC-28 and AC-29 additionally require B1/B2 runtime evidence. No runtime acceptance is claimed for those two prerequisites. The epic plan header "29/29 lead mappings" accurately counts story-to-AC assignments, not implementation completion.

### 1.2 NonFunctional Requirements

| NFR | Coverage | Story |
|---|---|---|
| NFR1 (no private key leaves OS store) | Architecture §3.1, §4.4, THREAT-MODEL security properties | 29.2, 29.6, 29.9 |
| NFR2 (asymmetric vs HMAC crypto) | Architecture §4.4, AD-60, AD-66 | 29.2, 29.9 |
| NFR3 (group_id CHECK) | Migration 061, 063 | 29.1 |
| NFR4 (append-only events) | Migration 37, Architecture §11.1 | 29.16 |
| NFR5 (transactional vs fire-and-forget audit) | Architecture §11.1 | 29.16 |
| NFR6 (device tokens bypass cache) | AD-66, Architecture §7 | 29.10 |
| NFR7 (additive migrations, ordered rollback) | Architecture §3.4, AD-61 | 29.1 |
| NFR8 (MCP_DOCKER only) | CLAUDE.md invariant | All stories |
| NFR9 (no new port) | Architecture §8.5, AD-45 | All stories |
| NFR10 (IEEE P1363 r‖s) | Architecture §4.4, AD-64 | 29.2 |

**Result:** All 10 NFRs covered by architecture and mapped to implementation stories.

### 1.3 Additional Requirements (from Architecture)

| AR | Coverage | Story |
|---|---|---|
| AR1 (device_enrollments SECURITY DEFINER) | Migration 060 | 29.1 |
| AR2 (paired_devices, enrollment_id audit-only) | Migration 061 | 29.1 |
| AR3 (mcp_tokens DEFERRABLE trigger) | Migration 062 | 29.1 |
| AR4 (device_challenges + resolve_device_route) | Migration 063 | 29.1 |
| AR5 (RFC 9421 + RFC 9530) | Architecture §4.4 | 29.2 |
| AR6 (OAuth authorization code) | Architecture §4.2, AD-65 | 29.3, 29.6 |
| AR7 (pg_advisory_xact_lock device limit) | Architecture §4.2c | 29.5 |
| AR8 (atomic revocation at mutation path) | Architecture §5.4 | 29.8 |
| AR9 (deriveScopesForMembershipRole helper) | Architecture §5.3 | 29.8 |
| AR10 (grace recovery-only) | Architecture §6.5 | 29.14 |
| AR11 (pre-human audit group_id) | Architecture §11.1 | 29.16 |
| AR12 (lazy delete + maintenance command) | Architecture §3.3b | 29.1 |
| AR13 (PrincipalContext.pairedDeviceId) | Architecture §2.2 | 29.6, 29.10 |

**Result:** All 13 additional requirements from architecture covered.

---

## 2. Story Quality Assessment

### 2.1 Structural Completeness (all 21 stories)

Every story file contains:
- ✅ User Story (role/action/benefit)
- ✅ Outcome (concrete, testable)
- ✅ Scope (specific files and functions named)
- ✅ Dependencies (explicit, backward-only)
- ✅ Blocks (what this story unblocks)
- ✅ Acceptance Criteria IDs (mapped to SPEC AC-01..AC-29)
- ✅ Architecture/ADR references (section-level citations)
- ✅ Source code and migration touchpoints (files listed)
- ✅ Required tests (test file paths, lane, assertions)
- ✅ Governance/security evidence (invariants, controls, fail-closed behavior)
- ✅ Rollback or failure behavior
- ✅ Definition of Done (concrete, verifiable)
- ✅ Non-goals (explicit scope boundaries)

### 2.2 Identity Language

All stories use neutral identity language ("As the Allura platform", "As a desktop bridge", "As a human principal or tenant admin"). No persona names, no gendered pronouns. Consistent with architecture conventions.

### 2.3 Test Plan Quality

Each story specifies:
- Test file paths (e.g., `src/lib/device-pairing/__tests__/...`)
- Test lane (unit, integration, e2e, live-db)
- Specific assertions (200/404/403 responses, state transitions, audit events)
- Governance/security evidence tied to architecture sections

Stories 29.18 and 29.19 serve as consolidation points — 29.18 fills unit test gaps, 29.19 fills integration test gaps. This is a sound pattern for comprehensive coverage.

### 2.4 Story Sizing

Stories are appropriately scoped:
- **Small** (pure functions): 29.2 (RFC 9421 verifier), 29.3 (PKCE utils)
- **Medium** (single API route + tests): 29.4, 29.5, 29.7, 29.12, 29.13, 29.14, 29.15
- **Large** (multi-route + cross-cutting): 29.6 (completion + PrincipalContext + scope derivation), 29.9 (exchange + authority resolution), 29.10 (authenticator bypass)
- **Infrastructure** (schema only): 29.1 (4 migrations)
- **Cross-cutting**: 29.16 (audit across all routes), 29.17 (credential scan), 29.18/29.19 (test consolidation)

No story is so large it should be split; no story is so small it lacks meaningful scope.

---

## 3. Dependency DAG Validation

### 3.1 Acyclicity

The DAG in the epic plan (§Dependency DAG) has been validated: every edge points from a higher-numbered story to a lower-numbered story. No cycles exist.

### 3.2 Backward-Only Dependencies

Every story depends only on lower-numbered Epic 29 stories:

| Story | Depends On | Valid? |
|---|---|---|
| 29.1 | None | ✅ |
| 29.2 | 29.1 | ✅ |
| 29.3 | 29.1 | ✅ |
| 29.4 | 29.1, 29.3 | ✅ |
| 29.5 | 29.1, 29.3, 29.4 | ✅ |
| 29.6 | 29.1, 29.2, 29.3, 29.5 | ✅ |
| 29.7 | 29.1, 29.6 | ✅ |
| 29.8 | 29.1, 29.6 | ✅ |
| 29.9 | 29.1, 29.2, 29.6, 29.7, 29.8 | ✅ |
| 29.10 | 29.1, 29.6 | ✅ |
| 29.11 | 29.7, 29.9 | ✅ |
| 29.12 | 29.1, 29.2, 29.7, 29.9 | ✅ |
| 29.13 | 29.2, 29.7, 29.12 | ✅ |
| 29.14 | 29.2, 29.7, 29.13 | ✅ |
| 29.15 | 29.1, 29.10 | ✅ |
| 29.16 | 29.4, 29.5, 29.6, 29.7, 29.9, 29.12, 29.13, 29.14, 29.15 | ✅ |
| 29.17 | 29.16 | ✅ |
| 29.18 | 29.1–29.17 (all) | ✅ |
| 29.19 | 29.1, 29.4–29.16 | ✅ |
| 29.20 | 29.1, 29.4–29.10 | ✅ |
| 29.21 | 29.1, 29.2, 29.6–29.15 | ✅ |

**Result:** DAG is valid. No forward dependencies.

### 3.3 Work-Package Sequencing

| WP | Stories | Parallelism | Depends On | Valid? |
|---|---|---|---|---|
| 1 | — (readiness gate) | — | — | ✅ |
| 2 | 29.1, 29.2, 29.3 | 29.2 ∥ 29.3 after 29.1 | WP1 | ✅ |
| 3 | 29.4, 29.5, 29.6 | Sequential 29.4→29.5→29.6 | WP2 | ✅ |
| 4 | 29.7, 29.8, 29.9, 29.10, 29.11 | 29.7 ∥ 29.8 ∥ 29.10 → 29.9 → 29.11 | WP3 | ✅ |
| 5 | 29.12, 29.13, 29.14 | Sequential 29.12→29.13→29.14 | WP4 | ✅ |
| 6 | 29.15, 29.16, 29.17 | Sequential 29.15→29.16→29.17 | WP4, WP5 | ✅ |
| 7 | 29.18, 29.19 | 29.18 ∥ 29.19 | WP6 | ✅ |
| 8 | 29.20, 29.21 | 29.20 ∥ 29.21 | WP7 | ✅ |
| 9 | — (final gates) | Sequential gates | WP8 | ✅ |

**Result:** Work-package sequencing is valid and consistent with the DAG.

---

## 4. Test and Evidence Plans

### 4.1 Test Lane Coverage

| Lane | Stories | Evidence Command |
|---|---|---|
| Unit | 29.2, 29.3, 29.8, 29.10, 29.18 | `bun run test:unit` |
| Integration | 29.1 (migrations), 29.4, 29.5, 29.6, 29.7, 29.9, 29.11, 29.12, 29.13, 29.14, 29.15, 29.16, 29.19 | `bun run test:integration` |
| Live-DB | 29.1 (migrations), 29.19 | `RUN_E2E_TESTS=true` |
| E2E | 29.20 | `bun run test:e2e` (B1-gated) |
| Platform | 29.21 | B2-gated (client repo) |
| Credential Scan | 29.17 | Automated scan script |

### 4.2 Evidence Quality

Every story specifies concrete test assertions (HTTP status codes, state transitions, audit events, invariant violations). No story relies solely on "tests pass" without specifying what the tests verify.

The consolidation stories (29.18, 29.19) explicitly list the test targets from earlier stories they cover, ensuring no gap between individual-story tests and the full-suite evidence.

### 4.3 Validation Commands (from Work-Package Plan)

| Command | Lane | Gate? |
|---|---|---|
| `bun run typecheck` | All | ✅ |
| `bun run test:unit` | Unit | ✅ |
| `bun run test:integration` | Integration | ✅ |
| `bun run test:live-db` | Live-DB | ✅ |
| `bun run test:e2e` | E2E | ✅ (B1 for 29.20) |
| `bun run build` | Build | ✅ |
| Credential scan | Security | ✅ (Story 29.17) |

**Result:** Test and evidence plans are complete and concrete.

---

## 5. Security Boundaries

### 5.1 Threat Model Coverage

The THREAT-MODEL.md identifies 15 threats with controls and residual risks. Each maps to architecture sections and implementation stories:

| Threat | Control | Story |
|---|---|---|
| Copied device ID/public key | Server nonce + signature | 29.2, 29.6, 29.9 |
| Enrollment-link interception | PKCE, state, TTL, single-use | 29.3, 29.4, 29.5, 29.6 |
| Rogue enrollment | Explicit approval, device limit, audit | 29.5, 29.6 |
| Challenge replay | 60s nonce, audience, single-use | 29.7, 29.9 |
| Access-token theft | 15-min TTL, per-device link, revocation | 29.9, 29.10, 29.15 |
| Tenant/workspace escalation | Server-side membership resolution | 29.8, 29.9 |
| Role retained after demotion | Exchange-time membership check | 29.8 |
| Workspace lockdown bypass | Exchange-time lock enforcement | 29.8, 29.9 |
| Rotation crash | Stage→prove→activate, idempotency, grace | 29.12, 29.13, 29.14 |
| Concurrent exchange | Row lock + atomic revoke/insert | 29.9 |
| Concurrent rotation | Generation number + atomic activation | 29.12, 29.13 |
| Lost/stolen device | Mark LOST, revoke tokens, invalidate caches | 29.15 |
| Log/audit credential leak | Allowlisted audit + automated scan | 29.16, 29.17 |
| Device limit abuse | Advisory lock + count | 29.5 |
| Pending-record accumulation | 10-min TTL + cleanup | 29.1, 29.16 |

### 5.2 Trust Boundaries

Six trust boundaries defined in THREAT-MODEL.md, each with corresponding architecture controls:
1. System browser / Clerk → initial human identity only
2. Desktop bridge / OS secure store → private-key creation and signing
3. Allura enrollment service → binds identity + membership + workspace + public key
4. Allura exchange service → validates PoP + live authority
5. MCP gateway → accepts only short-lived server-issued tokens
6. PostgreSQL → authoritative device grant, memberships, workspace, tokens, audit

### 5.3 Security Invariants

| Invariant | Enforcement | Story |
|---|---|---|
| No private key leaves OS store | Architecture + THREAT-MODEL | 29.2, 29.6, 29.9 |
| No reusable device bearer | Architecture §5 | 29.9 |
| Client cannot choose authority | Architecture §5.5 | 29.9 |
| Server-derived scopes on every exchange | Architecture §5.1-5.3 | 29.8, 29.9 |
| Atomic revocation at mutation path | Architecture §5.4 | 29.8 |
| Device tokens bypass cache | AD-66 | 29.10 |
| Append-only audit | Migration 37 | 29.16 |
| group_id on every read/write | CHECK constraint | 29.1 |

**Result:** Security boundaries are comprehensive and mapped to implementation.

---

## 6. B1/B2 Prerequisites

### 6.1 B1 — Clerk Test Instance

- **Affects:** Story 29.20 (AC-28)
- **Nature:** External evidence prerequisite — a dedicated Clerk test app with test users or a test-only `/api/device-pairing/_test/approve` endpoint
- **Story treatment:** 29.20 explicitly states "No runtime acceptance for AC-28 is claimed in this document" and skips with `B1_NOT_PROCURED` if unavailable
- **Impact on readiness:** B1 does not block Story 29.1 start or any WP2–WP7 work. It gates only the E2E test in WP8.
- **Status:** Not yet procured (correct — no evidence claimed)

### 6.2 B2 — Desktop Client Repository

- **Affects:** Story 29.21 (AC-29)
- **Nature:** External evidence prerequisite — real macOS Keychain, Windows CNG, Linux libsecret adapter implementations
- **Story treatment:** 29.21 implements server-side contract tests in this repo and defines the `ISecureKeyStore` interface + platform test contract for B2. No runtime acceptance claimed.
- **Impact on readiness:** B2 does not block Story 29.1 start or any WP2–WP7 work. It gates only the platform contract tests in WP8.
- **Status:** Not yet procured (correct — no evidence claimed)

### 6.3 B1/B2 Assessment

Both are **correctly identified as implementation prerequisites**, not story-drafting blockers. The epic plan §Implementation Prerequisites table explicitly states: "B1/B2 gate only Stories 29.20/29.21 and AC-28/AC-29." Stories may be drafted and implemented without B1/B2; only the E2E/platform evidence is gated.

**Result:** B1/B2 correctly handled. No BLOCK/HIGH finding.

---

## 7. Goal Stopping-Condition Alignment

### 7.1 Goal File

`ralph/goals/goal-20260908-2034.md`:
- **Objective:** "Complete Epic 29 end to end so an authorized user can pair once with Clerk, reconnect automatically with OS-keystore proof, rotate keys safely, and lose access immediately when authority is revoked."
- **Stopping condition:** All 21 stories `done`; sprint-status.yaml shows `done`; AC-01..AC-29 each have implementation evidence; all required tests, reviews, build, and CI pass; B1 and B2 pass without skips.

### 7.2 Alignment Check

| Goal Criterion | Epic Plan Coverage | Aligned? |
|---|---|---|
| 21 stories done | 21 stories exist, all backlog | ✅ (planning complete, implementation pending) |
| sprint-status.yaml shows done | Currently in-progress with all backlog | ✅ (will update during implementation) |
| AC-01..AC-29 evidence | 27 mapped + B1/B2 gated | ✅ |
| typecheck, test:unit, test:integration, test:live-db, test:e2e | All specified in stories | ✅ |
| Credential scan (Story 29.17) | Specified | ✅ |
| Build passes | WP9 gate | ✅ |
| B1/B2 without skips | Explicitly gated | ✅ |
| Security review: 0 BLOCK/HIGH | Architecture final review: 0 BLOCK, 0 HIGH | ✅ (architecture-level; code-level review during implementation) |
| Maintainability review: 0 BLOCK/HIGH | WP9 gate | ✅ |
| Retrospective accepted | WP9 gate | ✅ |

### 7.3 Goal Guardrails

| Guardrail | Epic Plan Treatment | Aligned? |
|---|---|---|
| Follow dependency graph | DAG validated, backward-only | ✅ |
| Move through dev/review/done | Work-package plan specifies per-story evidence | ✅ |
| No fabricated evidence | Stories specify concrete test assertions | ✅ |
| Server-derived authority | Architecture §5, AC-11/13 enforced | ✅ |
| No private-key leakage | Architecture §3.1, THREAT-MODEL | ✅ |
| Additive migrations, no CASCADE | Architecture §3.4, AD-61 | ✅ |
| No production deployment without approval | Goal guardrail + work-package guardrails | ✅ |
| Allura Brain is audit log, not proof of done | Goal guardrail | ✅ |
| Bounded Ralph execution | Goal guardrail | ✅ |

**Result:** Goal stopping condition fully aligned with epic plan and work-package plan.

---

## 8. Sprint Status Consistency

### 8.1 Current State

From `sprint-status.yaml`:
- `epic-29`: status `in-progress`
- All 21 `29-*` stories: status `backlog`
- `work_packages[1]` (WP1 — Readiness): status `in-progress`
- `work_packages[2-9]`: status `pending`

### 8.2 Assessment

The sprint-status.yaml correctly reflects the current state: Epic 29 is active, WP1 (readiness gate) is in-progress, no stories have started. This assessment IS the WP1 readiness gate.

**Note (LOW-1):** Once this gate passes, WP1 should transition to `done` and WP2 to `in-progress` (or `pending` awaiting the first story start). This is a normal sprint-status update, not a blocking issue.

---

## 9. Findings

### MED-1 — Verify grace_exchange_count wiring at implementation time

**Severity:** MED  
**Location:** Architecture §3.1b (DDL) and §6.5 (prose)  
**Defect:** The `grace_exchange_count` column was added in architecture revision 4 (closing the prior final-review MED-1). The implementing story (29.1) must verify the column exists in the migration DDL and that the grace-path exchange code (Story 29.14) checks+increments it under the row lock.  
**Impact:** Not a BLOCK because the grace window is recovery-only (no normal MCP token mint). The rate-limit is defense-in-depth.  
**Resolution:** Story 29.1 verifies the column in migration 061; Story 29.14 wires the counter.  
**Blocks Story 29.1?** No — the column is in the architecture DDL and will be created by the migration.

### LOW-1 — Sprint-status.yaml WP1 status transition

**Severity:** LOW  
**Location:** `sprint-status.yaml` work_packages[1]  
**Defect:** WP1 is `in-progress`. After this readiness gate passes, it should transition to `done`. This is a normal operational update, not a planning defect.  
**Impact:** None on implementation readiness.  
**Resolution:** Update sprint-status.yaml after this gate passes (not in this assessment per the no-edit constraint).

---

## 10. Gate Exit Criteria Verification

| Criterion | Status | Evidence |
|---|---|---|
| All 21 story files exist | ✅ | Glob confirmed 21 files matching `29-*.md` |
| All stories report `Status: backlog` | ✅ | All 21 story headers show `Status: backlog` |
| AC-01..AC-29 each has exactly one lead story | ✅ | Traceability matrix verified (§1.1) |
| Dependency graph is acyclic | ✅ | DAG validated (§3.1) |
| Dependencies are backward-only | ✅ | Every story depends on lower-numbered stories only (§3.2) |
| B1/B2 gate only Stories 29.20/29.21 | ✅ | Explicitly stated in epic plan §Implementation Prerequisites |
| sprint-status.yaml has Epic 29 tracking | ✅ | Epic 29 in-progress, 21 stories in backlog |
| No production code, migration, deployment, secret, commit, or push | ✅ | No implementation artifacts created |
| Architecture approved-for-stories | ✅ | Revision 4, status `approved-for-stories` |
| Architecture final review: 0 BLOCK, 0 HIGH | ✅ | Final review passed |
| SPEC approved | ✅ | Status `approved-for-architecture` |
| Goal stopping condition aligned | ✅ | §7.2 verified |

---

## 11. Verdict

### GO-WITH-CONDITIONS

**BLOCK: 0** | **HIGH: 0** | **MED: 1** | **LOW: 1**

GO requires 0 BLOCK and 0 HIGH. Threshold met.

**Conditions (none block Story 29.1 start):**

1. **MED-1:** Story 29.1 must verify `grace_exchange_count` column exists in migration 061 DDL. Story 29.14 must wire the counter check+increment under row lock. These are implementation-time verification steps, not pre-implementation blockers.

2. **LOW-1:** Sprint-status.yaml WP1 should transition to `done` after this gate passes. Normal operational update.

**B1/B2 remain explicit implementation prerequisites** — they must not be treated as completed evidence. Stories 29.20 and 29.21 may be drafted and implemented, but runtime acceptance for AC-28 and AC-29 requires B1 and B2 evidence respectively.

**Recommendation:** Story 29.1 may begin immediately. WP2 (Foundations) is unblocked.

---

> "Conceptual integrity is the most important consideration in system design." — Frederick P. Brooks Jr.
