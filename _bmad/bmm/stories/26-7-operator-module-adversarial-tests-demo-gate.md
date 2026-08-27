# Story 26.7 — Operator Module, Adversarial Tests, and Demo Gate

**Status:** In Progress — the direct Bumblebee dashboard route is absent after Story 25.3a scope reconciliation. AC-1, AC-6, and AC-9 therefore lack an active-route evidence path; AC-2 remains blocked pending remediation verification and independent review of the local Epic 25 server-issued registry. The remaining five criteria retain their local test evidence, but this story must not be described as "8 of 9 complete."
**Owner:** Pike + Fowler + Brooks + Bellard
**Depends on:** 26.4, 26.5, 26.6, Story 25.3b Epic 25 module registry (dependency-blocked)
**Blocks:** —

## Outcome

A truthful operator surface with Sources, Exposures, Policy Drafts, Incidents, and Receipts views, proven by adversarial tests, fail-closed behavior, tenant isolation, accessibility, rollback, and incident-replay evidence.

## Acceptance Criteria

- [ ] Operator module surfaces: Sources, Exposures, Policy Drafts, Incidents, and Receipts. — **Not currently route-evidenced:** `src/app/dashboard/bumblebee/page.tsx` is absent.
- [ ] Module is registered through the Epic 25 server-issued module registry. — **Blocked, not deferred.** A local registry remediation exists but is pending verification and independent review; AC-2 cannot advance until Story 25.3b is accepted.
- [x] Fail-closed: invalid/incompatible/untrusted/capability-missing modules are rejected.
- [x] Tenant isolation: a forged tenant cannot read or mutate another tenant's alerts or policy drafts.
- [x] Accessibility: ARIA/keyboard tests pass for all surfaces.
- [ ] Rollback: disabling Bumblebee leaves the dashboard shell, core API/MCP controls, and other modules operational. — **Not currently route-evidenced:** there is no active Bumblebee route to disable.
- [x] Incident replay: an advisory can be replayed through exposure, decision, action result, and recovery evidence.
- [x] Initial replay fixtures cover: 2025 Nx s1ngularity compromise, 2025 Shai-Hulud supply-chain worm pattern, and a mutable GitHub Action reference compromise.
- [ ] Demo shows the full flow: advisory → exposure → policy draft → approval → action → receipt → recovery. — **Not currently route-evidenced.**

## AC-2 is genuinely blocked (not skipped)

`REQ-MOD-001`, `REQ-MOD-002`, and `REQ-MOD-003` in
[REQUIREMENTS-MATRIX.md](../../../docs/allura/REQUIREMENTS-MATRIX.md) are all marked
`Dependency-blocked` against canonical story **25.3b**. The story is present in
`_bmad/bmm/stories/`, but its prerequisite-verification and independent-review gates remain open. A local source-controlled registry remediation is present in this branch, but it is not accepted implementation evidence and cannot register Story 26.7 yet.

Two dishonest options were available and rejected:

1. **Build a private registry inside Epic 26** and tick the box. This would have to
   be thrown away when 25.3b lands, and would make AC-2 read as satisfied while the
   actual dependency remained missing.
2. **Quietly reword the AC** to something Epic 26 can satisfy alone.

Instead, `src/lib/bumblebee/module.ts` publishes the **descriptor a server-issued
registry would consume** (`BUMBLEBEE_MODULE`: id, version, surfaces, required
capabilities, `readOnly: true`) and implements the fail-closed checks such a
registry would call (`assertCapabilities`, `assertCompatible`). When 25.3b ships,
registration should be wiring, not a rewrite. AC-2 stays unchecked until it is
genuinely done.

## Current Implementation Context — 2026-08-27

The five presentational surfaces remain in `src/components/bumblebee/surfaces.tsx`, but `src/app/dashboard/bumblebee/page.tsx` is intentionally absent while Story 25.3a preserves `/dashboard/curator` as the only future registry host. This is not an active operator module route and does not meet AC-1, AC-6, or AC-9.

Storage reads are no longer module-owned: `src/lib/curator/operator-read-service.ts` is the shared curator boundary. It is **SELECT-only**, routes every read through `withWorkspaceTransaction` (which sets the RLS GUCs), and carries explicit `group_id`/`workspace_id` predicates as defence in depth. `src/lib/bumblebee/queries.ts` is absent and a regression test prevents its return.

Two deliberate modelling decisions worth recording:

- **Incidents is derived from `threat_alerts` lifecycle**, not a new table. A
  separate `incidents` table would be a second source of truth about the same event,
  free to silently disagree with the alert it describes.
- **Receipts queries both receipt tables and merges in TypeScript** rather than using
  a SQL `UNION`. `mitigation_receipts` records a *decision about a draft*
  (`draft_id`, approve/reject); `containment_receipts` records an *action on real
  infrastructure* (`target_ref`, `connector`, plus an `authorization_chain` the other
  has no equivalent of). A UNION would null-pad or relabel those columns, asserting an
  equivalence that does not exist and making the audit surface less truthful.

**Fail-closed (AC-3).** `assertCapabilities` rejects any host that cannot grant all
three required read capabilities — a partially-capable security surface is worse than
an absent one, because an operator cannot tell which parts are lying.
`assertCompatible` rejects unknown module ids and incompatible major versions.

**Tenant isolation (AC-4).** `src/__tests__/bumblebee-tenant-isolation.e2e.test.ts`
runs the **real** read layer against a **real** PostgreSQL 16 instance with RLS
enforced — nothing mocked. Two tenants are seeded with deliberately
tenant-identifying data (`secret-package-of-<tenant>`) so a leak is unambiguous rather
than a matter of counting rows. Beyond the basic cross-tenant reads, it covers the two
forgeries an attacker would actually attempt: a wholly fabricated tenant (reads an
empty world, never everything), and **mixing tenant A's id with tenant B's workspace
id** — which returns nothing, because RLS requires both GUCs to match the row.

**Accessibility (AC-5).** `src/__tests__/bumblebee-surfaces.test.tsx` (jsdom,
`@testing-library/react`, matching `toast.test.tsx`/`inspector-panel.test.tsx`
conventions). Every surface is a landmark region with an accessible name; every table
has a `<caption>`; every column header carries `scope="col"` and every data row a
`scope="row"` row header. Empty states are asserted to render **explicit text rather
than an empty table**, so "no exposures" and "failed to load" are never
indistinguishable — to a screen-reader user or a sighted operator.

**Rollback (AC-6).** `BUMBLEBEE_MODULE_ENABLED` defaults to off; disabled renders a
404, not a broken page. The guarantee is structural: nothing outside
`src/lib/bumblebee/`, `src/components/bumblebee/`, and the module's own route imports
any of it. A test enforces that (`is imported by nothing except its own route`) so the
property survives future changes rather than resting on a one-off grep.

**Incident replay (AC-7/AC-8/AC-9).** `src/lib/replay/` drives fixtures through the
**real, unmodified** Story 26.2 inventory service, Story 26.3 exposure matcher, and
Story 26.5 draft generator. A replay using its own private logic would prove nothing
about the shipped system.

Each of the three named fixtures exercises a **different matcher path**, which is the
point of choosing them:

| Fixture | Real incident | Matcher path |
|---|---|---|
| `nx-s1ngularity` | Nx s1ngularity compromise (Aug 2025) | `package_version` |
| `shai-hulud` | Shai-Hulud self-propagating worm (Sep 2025) | `indicator` / install hook |
| `mutable-action-ref` | tj-actions/changed-files tag-moving compromise (Mar 2025) | `workflow_reference` |

Shai-Hulud matches on the shared **install-hook artifact**, not a package name, because
the defining trait of a self-propagating worm is precisely that it is not one package.

Every fixture also loads **decoy inventory that must not match** (a patched version, a
clean build, a SHA-pinned consumer of the same compromised action). A replay that only
ever loads known-bad records would pass even if the matcher matched indiscriminately.

**Fixtures carry no attacker content.** They are structured metadata only — no exploit
code, no payload, no obfuscated script, no advisory free text. This is enforced, not
just intended: `ThreatAdvisory` has no field capable of carrying free text, and a test
asserts no fixture smuggled any in. A fixtures file is exactly where someone would be
tempted to paste a real payload "for realism"; doing so would put attacker-authored
code in the repo and in CI for no analytical gain.

## A real finding produced while building this

The `mutable-action-ref` fixture motivated building a real `ci_workflow` inventory
source (`src/lib/inventory/ci-workflow-parser.ts`) — the second of ten artifact types
to get one. Run against **this repository's own `.github/workflows/`**, it found:

- **17 distinct third-party GitHub Action references across 17 workflow files**
- **4 SHA-pinned** (immutable): `actions/checkout`, `oven-sh/setup-bun`,
  `actions/upload-artifact`, `actions/download-artifact` — all in
  `epic-24-evidence.yml`
- **13 pinned to mutable tags** (attacker-movable), including
  `gitleaks/gitleaks-action@v2`, `actions/dependency-review-action@v4`,
  `anchore/sbom-action@v0`, `actions/github-script@v6`, and
  `dawidd6/action-download-artifact@v8`

Those 13 are the exact exposure class the March 2025 tj-actions compromise exploited.
This is a genuine finding about this repository, not a synthetic demo result. It is
surfaced on the Sources surface as a distinct "Mutable tag" pinning state and counted
in the module summary (`unpinnedActions`).

**A design trap was caught here.** The parser initially marked mutable-tag references
`trust_state: "provisional"`, reasoning that an unpinned tag is less trustworthy. That
was wrong and actively harmful: `trust_state` means *"is this record's provenance
confirmed"* (it is — it was read out of the committed workflow file), **not** *"is this
artifact safe"*. Since Story 26.3's matcher only produces exposures for `verified` +
`fresh` records, marking unpinned tags `provisional` would have made the single most
attackable class of reference **permanently unmatchable** — silently exempting exactly
the artifacts most likely to be compromised. All records are now `verified`, with the
pinning distinction carried in `hash` (`"unpinned"` sentinel). A regression test pins
this.

## Evidence

- Operator surfaces: presentational components `src/components/bumblebee/surfaces.tsx`; shared curator read boundary `src/lib/curator/operator-read-service.ts`. There is no active `src/app/dashboard/bumblebee/page.tsx` route.
- Accessibility + surface tests: `src/__tests__/bumblebee-surfaces.test.tsx` — 34/34 passed.
- Fail-closed + rollback + no-coupling tests: `src/lib/bumblebee/__tests__/module.test.ts` — 13/13 passed.
- Adversarial tenant isolation: `src/__tests__/bumblebee-tenant-isolation.e2e.test.ts` — 8/8 passed against a real PostgreSQL 16 container with RLS enforced. Registered in `vitest.config.live-db.ts`. Run twice against the same database to prove the seed is idempotent.
- Incident replay: `src/lib/replay/{fixtures,engine}.ts`, `src/lib/replay/__tests__/engine.test.ts` — 24/24 passed, driving the real matcher and draft generator.
- CI-workflow inventory source: `src/lib/inventory/ci-workflow-parser.ts`, `src/lib/inventory/__tests__/ci-workflow-parser.test.ts` — 19/19 passed, including the `trust_state` regression guard.
- Scheduler-health evidence bundle: `docs/archive/allura/evidence/epic-26/26.7/scheduler-health-evidence.md`.
- Full suite remediation verification: `bun run test:unit` → 2152 passed / 160 skipped, exit 0; `bun run typecheck` → exit 0. The known assertion-path stderr remains from existing negative/degradation tests.

## Rollback

Disable or keep absent any future Bumblebee route until the Epic 25 registry composes it. The dashboard shell and other modules remain operational; no registry is implemented by this story.

## Completion Notes

- agent: Brooks
- date: 2026-08-27
- files changed: historical initial implementation included `src/lib/bumblebee/queries.ts` and `src/app/dashboard/bumblebee/page.tsx`; both are superseded by the Story 25.3a reconciliation. Current operator reads live only at `src/lib/curator/operator-read-service.ts`; the direct route remains absent.
- evidence: historical component/replay/live-RLS evidence is retained above. Remediation verification: focused curator/Bumblebee tests 55/55 passed; `bun run test:unit` → 2152 passed / 160 skipped; `bun run typecheck` → exit 0.
- remaining gaps: **AC-1, AC-6, and AC-9 are not currently evidenced** because the direct dashboard route is absent. **AC-2 is genuinely blocked** on the Epic 25 server-issued module registry (`REQ-MOD-001/002/003`, canonical story 25.3b); a local source-controlled registry candidate is present but pending independent acceptance, so it cannot register Story 26.7. AC-3/4/5/7/8 retain their local evidence. Inventory coverage remains 2 of 10 artifact types.
