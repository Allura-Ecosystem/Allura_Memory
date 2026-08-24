# Story 25.3a — Optional 3D Knowledge Explorer

**Status:** Planned / dependency-blocked
**Owner:** Pike + Bellard + Hightower
**Depends on:** 25.3 real 2D map; 25.4 evidence-first detail; measured browser/device evidence
**Blocks:** No required story; it must never block the 2D launch.

## Outcome

Offer an opt-in 3D exploration mode for a **server-authorized, focused subgraph**. It uses the exact `SubgraphPlan` and `SubgraphResponse` contract already used by the 2D map. It is an exploration renderer, never a retrieval path, authority path, or decision surface.

## Acceptance Criteria

- [ ] The explorer receives only the typed, server-bounded subgraph response; it does not query storage, choose tenant/workspace scope, expand unboundedly, or invent nodes/edges.
- [ ] The 2D map and adjacent text relationship list remain the required accessible reference experience.
- [ ] The explorer is opt-in, feature-flagged, and has a documented rollback that removes it without affecting map retrieval or review workflows.
- [ ] Every selected 3D node opens the same governed detail/evidence/receipt inspector used by 2D.
- [ ] The visible graph states whether it is complete, bounded, partial, degraded, or denied; it never claims to show all workspace knowledge.
- [ ] Bellard captures seeded graph budgets, server p50/p95 query time, response size, supported-device browser render/interaction timing, and cancellation behavior before any scale claim.
- [ ] Pike verifies that 3D improves a defined exploration task without replacing keyboard, text, or 2D workflows.
- [ ] Hightower verifies the feature flag, error monitoring, browser fallback, and rollback rehearsal.

## Explicit Exclusions

- No 3D graph in the first real curator release.
- No whole-workspace globe, particle field, infinite graph, animated telemetry, or decorative relationship inference.
- No approve, reject, request-evidence, connector, or assistant mutation controls.
- No scale, real-time, or WebGL performance claim without measured evidence.

## Evidence

```text
docs/archive/allura/evidence/epic-25/25.3a/
```

Include contract parity, device/browser measurements, accessibility fallback proof, feature-flag evidence, and rollback rehearsal.
