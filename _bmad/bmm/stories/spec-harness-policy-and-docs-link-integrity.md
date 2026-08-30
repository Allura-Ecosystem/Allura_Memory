---
title: 'Harden Harness Policy Assertions and Canonical Docs Link Validation'
type: 'bugfix'
created: '2026-08-30'
status: 'done'
review_loop_iteration: 0
baseline_commit: '34affbb3b196c9a7859756dc81446e013111bd35'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two governance checks provide misleading confidence. Scenario `policy_expectations` previously recorded the scenario's declared allow/deny decision without establishing that the policy exists or that the step's observed result agrees with the declaration. The canonical-docs residue guard also claimed internal links resolved while its regex-based link extraction ignored reference-style links and treated links in code samples as documentation links.

**Approach:** Make harness policy expectations evidence-bearing by validating each declared policy identifier against the canonical policy registry and comparing allow/deny expectations with the executed fixture outcome. Make the docs guard check inline, titled, and reference-style internal links while excluding fenced and inline code. Preserve the guard's intentionally narrow scope: it is not a general Markdown parser.

## Boundaries & Constraints

**Always:** Preserve deterministic simulate-mode behavior; validate policy declarations after the engine run so engine error handling cannot hide an assertion failure; retain receipts' ordered policy-decision records; use only the active canonical policy registry (`findPolicyById` / `CANONICAL_POLICIES`) as the policy-ID authority; retain existing Neo4j-residue detection and active-doc scope; leave external URLs and anchors out of link resolution; verify code with typecheck, unit tests, real scenario runs, and the shell guard.

**Ask First:** Expanding the harness to invoke a complete production authorization/policy engine instead of checking the registry plus observed fixture outcome; replacing the shell guard with a third-party Markdown parser; widening scanning to archived docs, arbitrary generated content, external URLs, or anchor validation.

**Never:** Do not emit a policy decision merely because a scenario declared it; do not alter canonical policy behavior or policy definitions; do not make intentionally failing policy/injection/cross-tenant scenarios pass; do not scan links inside fenced or inline code; do not claim multi-line Markdown link support from this guard; do not change archived documentation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid denied policy expectation | Canonical policy ID; `expected_decision: deny`; fixture returns `POLICY_DENIED` | Receipt records the declared policy decision and scenario completes with its expected failed status | No policy-expectation assertion error |
| Unknown policy ID | `policy_expectations` names an ID absent from `CANONICAL_POLICIES` | Run fails after engine completion with the scenario ID, step, and unknown ID | Do not silently record an invented policy result |
| Mismatched allow/deny expectation | Declared allow but fixture is denied, or declared deny but fixture succeeds | Run fails after engine completion with expected and observed outcome | Preserve engine status; surface assertion violation rather than masking it as a tool failure |
| Code-sample Markdown link | Link-like text inside fenced block or inline backticks | Guard ignores the sample | No false positive |
| Reference-style link | `[label]: relative/path.md` in an active document | Guard resolves existing path; missing path fails the guard | Ignore external URLs and anchors |

</frozen-after-approval>

## Code Map

- `src/lib/harness/runner.ts` -- `buildDefinition()` executes ordered fixtures and records policy decisions; `runScenario()` owns post-run assertions. Use `findPolicyById` from `src/lib/governance/policies.ts` to validate IDs. Do not throw inside a process step for an assertion violation because ProcessEngine converts it into a step failure; collect violations and fail after the run reaches a terminal state.
- `src/lib/governance/policies.ts` -- `CANONICAL_POLICIES` and `findPolicyById()` are the canonical read-only registry. No policy definition changes are needed.
- `src/lib/harness/__tests__/scenario-harness.test.ts` -- in-memory ProcessEngine coverage. Add/retain tests for unknown policy IDs, observed outcome mismatches, and valid denied expectations.
- `.github/scripts/docs-backend-residue-guard.sh` -- CI guard for active canonical docs and runtime surfaces. `check_links()` must preprocess Markdown bodies, resolve relative inline/titled/reference targets, and preserve explicit exclusions.
- `tests/scenarios/*.json`, `examples/*/scenarios/*.json` -- real deterministic fixtures. They are verification inputs; change only if a currently valid policy expectation conflicts with the canonical registry or observed outcome.
- `_bmad/bmm/stories/deferred-work.md` -- update DW-1 and DW-2 outcomes only after verification; preserve history and source/evidence references.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/harness/runner.ts` -- validate policy expectation IDs against the canonical registry and compare expected decisions to observed `POLICY_DENIED`/success results after the run -- eliminates self-fulfilling policy evidence.
- [x] `src/lib/harness/__tests__/scenario-harness.test.ts` -- cover valid, unknown-ID, and allow/deny mismatch behavior -- pins failure messages and post-run assertion timing.
- [x] `.github/scripts/docs-backend-residue-guard.sh` -- strip fenced/inline code, validate inline/titled/reference relative links, and state its remaining multi-line limitation -- prevents false positives and unsupported success claims.
- [x] `_bmad/bmm/stories/deferred-work.md` -- record resolved evidence for DW-1/DW-2 or retain only genuinely deferred scope -- keeps governance ledger truthful.

**Acceptance Criteria:**
- Given a scenario policy expectation with an unknown ID, when the scenario runs, then it fails with a policy-expectations error naming that ID and does not create a fabricated valid policy decision.
- Given a declared policy decision conflicts with the fixture's observed deny/success result, when the scenario reaches a terminal state, then the harness reports the mismatch after the engine run rather than converting it into an unrelated tool failure.
- Given a canonical policy ID and matching observed denial, when the scenario runs, then the expected failed scenario outcome and receipt remain valid.
- Given active Markdown containing valid inline, titled, or reference-style relative links, when the guard runs, then it resolves those paths; given a missing path, it exits nonzero; given link-like code samples, it does not fail.
- Given all existing tests and real fixtures, when verification runs, then typecheck passes, harness tests pass, intentional policy/security failures remain intentionally failed, and the docs guard passes.

## Design Notes

Policy expectation validation is intentionally a **harness evidence check**, not a replacement authorization engine. `findPolicyById()` proves the declared control is canonical; the fixture result proves the scenario's declared allow/deny outcome matches execution. A future story may wire production policy evaluation into harness execution, but this patch must not pretend it has done so.

The docs guard remains a bounded shell check. Preprocessing removes code-only content before extraction; it adds the most common Markdown link forms. It explicitly documents that multi-line inline links, anchors, and remote URLs are outside its scope rather than claiming universal resolution.

## Verification

**Commands:**
- `bun run typecheck` -- expected: exit 0.
- `bun run vitest run --config vitest.config.unit.ts src/lib/harness/__tests__/scenario-harness.test.ts` -- expected: all harness tests pass, including policy-expectation edge cases.
- `set -a && source .env.local && set +a; for f in tests/scenarios/*.json examples/*/scenarios/*.json; do timeout 35 bun run scripts/harness.ts "$f"; done` -- expected: success/recovery scenarios complete; intentional denial, prompt-injection, and cross-tenant scenarios report their expected failed status.
- `bash .github/scripts/docs-backend-residue-guard.sh` -- expected: exit 0 against repository docs.

## Suggested Review Order

**Policy evidence integrity**

- Unknown policy identifiers fail before execution; step outcomes distinguish allow, deny, and error.
  [`runner.ts:145`](../../../src/lib/harness/runner.ts#L145)

- Canonical declarations alone populate receipt policy decisions after post-run outcome verification.
  [`runner.ts:470`](../../../src/lib/harness/runner.ts#L470)

- Focused tests pin unknown-ID, deny/allow mismatch, and non-policy-error behavior.
  [`scenario-harness.test.ts:197`](../../../src/lib/harness/__tests__/scenario-harness.test.ts#L197)

**Documentation guard correctness**

- Preprocess code samples and resolve bounded internal Markdown link forms.
  [`docs-backend-residue-guard.sh:165`](../../../.github/scripts/docs-backend-residue-guard.sh#L165)

- Temporary Git-repository regression test exercises passing and failing reference links.
  [`docs-backend-residue-guard.test.ts:47`](../../../src/__tests__/docs-backend-residue-guard.test.ts#L47)

- Unit-lane registration ensures the guard regression test actually runs in CI.
  [`vitest.config.unit.ts:108`](../../../vitest.config.unit.ts#L108)

**Governance trace**

- Preserve DW-3 history and record bounded resolutions for DW-1 and DW-2.
  [`deferred-work.md:3`](deferred-work.md#L3)
