# Story 25.3b — Findings-Only Code Review

**Frozen implementation hash (reviewed diff):** `d25a1f6e026717512364e1b5973ccd352b90ba11` (PR #124 merge commit; diff 1,297 lines, 24 files)

**Remediation commits (post-review):**
- `c1516812` — fix(curator): 25.3b review remediation — truthful shell states + crash guards
- `9dfe12b9` — test(curator): executing test for /dashboard/curator page wiring
- (third commit) — fix(curator): explicit scope guards for role/identity completeness (Edge Case #2/#3)

**Verdict:** **APPROVE** (conditional → satisfied). The independent acceptance audit returned *not accepted as written*; all actionable findings were remediated across the three commits above, and the remaining items are documented dispositions below.

**Independent reviewers:** Blind Hunter (⚠️ API timeout — no findings produced; not re-run), Edge Case Hunter, Verification Gap Reviewer, Acceptance Auditor (bmad-code-review layers, 2026-08-28)

**Knuth:** Not applicable in this review record — the registry introduces no schema/migration change (ledger event reuse only); schema concerns are covered by the registry unit/live suites.

## Remediated findings (resolved in the two commits above)

| Severity | Source | Finding | Resolution |
| --- | --- | --- | --- |
| High | Edge Case Hunter | `module.summary!` non-null assertion in the adapter crash-loops the whole curator page when a module is `available` without a summary | `bumblebee-workflow-adapter.tsx` now renders the unavailable section unless `state === "available" && summary` is present |
| Medium | Acceptance Auditor (#9) | `getAuthUser(request)` at the page boundary is outside any try/catch — a throwing auth resolver produces an unhandled 500 instead of the canonical shell state | `page.tsx` wraps the resolver; failure falls through to the standard login redirect path |
| Medium | Acceptance Auditor (#3) | Disabled module renders under `state: "complete"` whose copy claims "Curator workflows are ready" | Disabled branch now emits `degraded` with an explicit "Bumblebee is currently unavailable." message |
| High | Verification Gap Reviewer | The production `/dashboard/curator` page — the only consumer of `issueCuratorModules` — had no executing test; a wiring regression would ship the legacy static console with every lane green | New `src/__tests__/curator-handoff-page.test.tsx` executes the real default export and pins issued-shell, degraded-when-disabled, and unauthenticated-redirect behaviors; wired into the unit lane |
| Low | Edge Case Hunter (#2) | `deriveScope` did not require `user.role` explicitly; fail-closed behavior rested on `roleLevel(undefined)` (undefined >= n → false) coincidentally denying | `deriveScope` now requires `role` with a comment explaining the intent must not rest on the numeric-coincidence |
| Low | Edge Case Hunter (#3) | Page redirect guard checked only `workspaceId`/`sessionId`; a complete-but-partial user could render "Signed in as undefined" | Redirect guard now also requires `id`, `groupId`, and `role` |

## Disposed findings (no code change; recorded disposition)

| Severity | Source | Finding | Disposition |
| --- | --- | --- | --- |
| Spec-interpretation | Acceptance Auditor (#1) | AC-2 lists "policy" as a separate evaluation dimension; issuance only performs role→capability mapping via `actionForReadCapability` → `minimumRoleForAction` | **Accepted as satisfied.** The canonical `permission-action-role` binding is the single authorization gate in this codebase (route manifests, `withPermission`, every guarded action). A separate policy engine would create a duplicate authority plane, which the story's own prerequisite review explicitly forbids. Noted in the story record. |
| Design intent | Acceptance Auditor (#2) | Audit-write failure converts a denied/disabled/read-failure outcome into `error` ("audit recording failed") | **Intentional fail-closed.** A denial whose audit outcome could not be durably recorded must not be presented as the ordinary outcome; `error` is the honest state. Documented in `EVIDENCE-INDEX.md`. |
| Design intent | Acceptance Auditor (#4) | Canonical `empty` shell state is unreachable — a zero-module allowlist surfaces as `error` via the "incomplete source-controlled module set" throw | **Accepted.** A zero-module allowlist is a configuration error, not an empty-but-valid state; `error` is the honest response. |
| Dead-stronger check | Acceptance Auditor (#5) | `manifestHash` integrity comparison is shadowed by a prior reference-identity check | **Accepted.** Reference identity against the frozen private snapshot is strictly stronger than hashing; the hash still feeds audit metadata (`manifest_sha256`). |
| Architecture boundary | Acceptance Auditor (#6) | Identity is delegated to `getAuthUser(request)` header parsing with no anti-forgery proof in this diff | **Accepted by design.** The header seam is owned and overwritten by the Story 25.2b middleware auth entry (executing test `story-25-2b-auth-entry.test.ts`); the registry never trusts browser-supplied capability data. |
| Spec-fidelity, future | Acceptance Auditor (#7) | Adapter hardcodes a summary `<dl>`; manifest `stages`/`surfaces` are decorative, not rendered through approved shared workflow components | **Deferred.** Presentational fidelity gap, not a safety gap; the module remains read-only and host-bounded. Revisit when a second module or shared workflow components land. |
| Evidence gap | Acceptance Auditor (#8) | AC-7 tenant/workspace isolation proof partly rests on the pre-existing `bumblebee-tenant-isolation.e2e.test.ts` (outside PR #124) | **Accepted.** The e2e exists and passes in CI; the story record cites it via the evidence index. |
| Test-label | Verification Gap Reviewer | `module-registry.audit-failure.test.ts` title targets an unreachable `manifest_invalid` branch (registry validates its own frozen snapshot); the test actually exercises `appendDecision` write rejection | **Non-blocking.** Renamed-titled follow-up; reachable audit-failure protections (denied/disabled/read-failure) are properly covered in `module-registry.test.ts`. |
| Label precision | Edge Case Hunter (#4) | A workspace-transaction failure (read OR write) is recorded as `read_failure`; a write/commit failure is mislabeled, though the rollback still yields a truthful unavailable outcome | **Deferred.** The transaction rolls back on any failure so the outcome is honest; splitting the error classes inside the transaction boundary is more invasive than a remediation pass warrants. Noted for a follow-up. |
| Dead code | Verification Gap Reviewer | `assertCapabilities`/`assertCompatible` in `src/lib/bumblebee/module.ts` have no production callers | **Non-blocking.** Kept as defensive module-level contracts; noted for future cleanup. |

## Verification (post-remediation)

- Focused registry suite: **14/14 passed**.
- Shell suite: **3/3 passed**.
- New page-execution suite: **3/3 passed** (`curator-handoff-page.test.tsx`).
- Full unit lane: **2,252 passed | 160 skipped** (was 2,249 before the new suite).
- Typecheck: clean.
- ESLint on changed files: clean (0 errors, 0 warnings).
- CI on `develop` pushes (`c1516812`, `9dfe12b9`): green.

## Scope conclusion

The server-issued, allow-listed module registry is a metadata-only, read-only handoff boundary: it derives scope from the canonical auth resolver, evaluates capabilities through the canonical permission-action binding, never accepts caller-supplied authority or capability data, fails closed on invalid/denied/disabled outcomes, records every decision as an immutable ledger event, and leaves shell truth states host-owned. The production page wiring now has an executing test that pins the issuance→shell composition and both remediated states. Story 25.3b may advance to accepted, unblocking `REQ-MOD-001..003` and Story 26.7 AC-2.
