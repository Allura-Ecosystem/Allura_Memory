---
title: '1.2 Authority and service contracts'
type: feature
created: '2026-10-26'
status: done
baseline_commit: 9e3df50891f99b4ed9e0f6e33f9082a68f2ef9ce
route: dispatch
review_loop_iteration: 0
context: [guidelines/ALLURA-BMAD.md]
---

<frozen-after-approval>
## Intent
Specify one coherent server-owned authority boundary for the fresh memory service. Use the supplied resolved-contract candidate and ENT-01 owner evidence, correcting defects under delegated design authority. No independent development reviewer; do not alter product independent-human review.

## Boundaries & Constraints
Always separate identity from current tenant/workspace/action grants, recheck authority before effect/disclosure and deny unknown mappings. Never change live grants, production, protected specifications, UX or vendor bodies. This is contract acceptance, not runtime verification.

## I/O & Edge-Case Matrix
| Scenario | Input/state | Expected behavior |
|---|---|---|
| Org admin without workspace grant | content or derivative | deny |
| Bound human with current grant | permitted action | resolve only named scope |
| Machine impersonates human | review/grant request | deny |
| Self approval or changed reviewed version | decision | deny/conflict without mutation |
| Lost durable acknowledgement | write timeout | unknown, not failed or success |
</frozen-after-approval>

## Code Map
- `planning-artifacts/stories/1.2-authority-and-service-contracts.md`: six acceptance clauses.
- `planning-artifacts/prds/prd-Allura_Memory-2026-10-25/prd.md`: five tools and functional requirements.
- `docs/allura/DESIGN-ALLURA.md:1184`: signed human identity and same-origin controls; preserve bytes.
- Private Operations `story-1.2-decisions/resolved-contract.md`: delegated candidate, not a historical mandate.

## Tasks & Acceptance
- Create `planning-artifacts/contracts/authority-v1.md` with tool/action/service matrix, stable identity binding, grant lifecycle, outcome semantics, consumer inventory and implementation-negative cases.
- Reconcile the owned planning authority overlay without vendor changes.
- Given each Story 1.2 clause, when the owner self-checks the exact document, then every boundary has a concrete disposition and downstream test owner.
- Given candidate design defects, when adopting defaults, then corrections and rationale are explicit rather than attributed to Sabir.

## Implementation Notes
Methodology override: direct writer and self-checks per current user instruction. Native build rendered successfully; missing TEAM-RAM-RUNTIME replaced by loaded Brooks/Woz guidance and active adapter, SOLUTION-ARCHITECTURE by current architecture, DATA-DICTIONARY deferred to new 1.3 contract. No subagents ran. Brain recall unavailable.

## Verification
Manual matrix/threat inspection against all six story criteria; hash contracts and preserved sources. No product test claim for documentation.

Direct self-check completed: `contracts/authority-v1.md` maps all six criteria and corrects five candidate defects. Clarified curator raw-evidence restriction during final inspection. No independent reviewer; no live grants or deployment. Status above is BMAD artifact completion only, not an Allura work-item transition.
