# Epic 30 My Work — Current Design Approval Packet

Date: 2026-09-17  
Status: **approval requested; not approved**  
Candidate commit: `4370cac3f77d1ed9a10c069aaebaab470f9e69c7`
Production route: `/dashboard`, only when explicit non-production Epic 30 synthetic mode is enabled.

This packet replaces the visual candidate at `7d657aba` with its independently reviewed successor at `4370cac3`. It records what exists and the remaining variances; it does not grant design, story, human-study, or release acceptance.

## Bound artifacts

| Artifact                                                | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/components/dashboard/my-work-workspace.tsx`        | `7de47369664ae59e067f3b9d9ea17c173c1affab7733a8ef341bea593e1a3639` |
| `src/components/dashboard/my-work-workspace.module.css` | `c0e5536779a0116305d0c460b98553aebb7972015cb5fcb94197c33d6f3015ba` |
| Desktop ready screenshot                                | `3c4c46f313ea165a1ec5b39a1d99592d94d461e21e548c56d6632e84a6feca97` |
| Desktop comparison screenshot                           | `2189d23b9ec04169c636b29de85ffc9ad8647ec95615025943c1359e015a8dc1` |
| 320 px ready screenshot                                 | `64805345fd418ece7c912275d3dc6bcf60387c1d43bf64c014dcd7ea41279584` |
| 320 px comparison screenshot                            | `9ecebe42ea750c102dfeb16f117ad82ba36978b9247b57d52be824c79329b45a` |
| Automated accessibility audit                           | `8691c503e48be9791d70482458a5c2e274ce23979c5509fdad1b9c472fccce45` |

The screenshots and machine-readable audit are stored under `../implementation-artifacts/evidence/epic30-design-4370cac3/`. They were captured from a temporary non-shipping loopback route that rendered the same committed component with synthetic fixture content. The temporary route and capture code were removed after capture. Chromium 153 at 1440×1000 and 320×900 reported zero automated WCAG 2 A/AA violations in both ready and comparison states and zero browser runtime errors. Three scans had no incomplete checks; the 320 px comparison scan retained one manual `color-contrast` review because the fixed dialog overlaps other elements. A [source-and-screenshot contrast preflight](../implementation-artifacts/evidence/epic30-design-4370cac3/mobile-contrast-preflight.md) calculates 10.15:1 for the affected text against its declared opaque pane background, but does not close the rendered-overlay review. Real-browser assertions also covered modal bounds, inert background, bidirectional focus containment and post-close focus restoration. The development server's optional trace writer failed closed against absent local PostgreSQL; no trace was persisted, and this capture is not live-database evidence. No production data, credential, or model was attached.

## Current design

- Obsidian-inspired, Allura-branded knowledge workspace with a compact tool rail, authorized private/department tree, document reading pane, co-visible context pane, outline/access inspector, and collapsed Ask rail.
- Allura Ink/Cream foundation with Blue for memory/intelligence, Orange for review emphasis, and Green for authorized visibility. The official Allura lettermark is used without modification.
- One primary document and at most one comparison pane. Closing comparison returns keyboard focus to its opener or the main article fallback.
- The context pane is explicitly labelled `PROXIMITY ONLY`; node position does not assert a link or verified relationship.
- Search remains disabled and Ask remains unavailable until their later authorization and provider gates are implemented. Unavailable rail actions are disabled rather than presented as false interactive affordances.
- Active document controls expose current state to assistive technology, Ask owns its disclosure with `aria-controls`, keyboard focus is visible, and interactive targets meet the 44 px local design target.
- Ready, authorized-empty, and fail-closed-unavailable states exist. No production fallback is used.

## Variance record

| Epic expectation                    | Current candidate                                                                                                                | Required disposition                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Memory tabs                         | Tab-like chrome identifies the open document and context pane, but is not an interactive memory-tab system                       | Implement and verify under Story 30.7, or approve a documented variance                                         |
| Authorized search and relationships | Search is disabled; the context pane shows co-visible records without relationship claims                                        | Implement under Story 30.8                                                                                      |
| Read-only cited Ask                 | Rail is present and truthfully unavailable; no content is transmitted                                                            | Implement only after Story 30.9 provider and authorization gates                                                |
| Restricted contractor messaging     | Tool-rail affordance is absent; no messaging is performed                                                                        | Implement under Story 30.10                                                                                     |
| Eight truth states                  | Ready, empty, and unavailable are implemented                                                                                    | Loading, forbidden, stale, degraded, conflict, and error/complete distinctions require contract-driven coverage |
| Accessibility                       | Semantic landmarks, named/current-state controls, visible focus, 44 px targets, focus restoration, responsive 320 px layout, and automated WCAG A/AA scans are locally covered | Screen-reader journey and real 200% browser zoom evidence remain required                                       |
| Live synthetic proof                | Static synthetic rendering and focused unit tests pass                                                                           | Restricted-role PostgreSQL/HTTP browser proof remains pending approved injected test credentials                |

## Proposed five-person protocol

Use only the final approved hash and synthetic data. Recruit five distinct people; role simulations do not count as participants. Each person completes the following without coaching:

1. Identify the synthetic-data and authority boundary.
2. Open a private document and state who may read it.
3. Open an approved department document and identify its department scope.
4. Open and close comparison, then resume reading from the initiating control.
5. Explain what the context pane does and does not claim.
6. Attempt Search and Ask, then explain why each is unavailable or what evidence an enabled result provides.
7. Repeat the core reading/comparison flow using keyboard only at 320 px and 200% browser zoom.

Record per participant and task: completion, coaching/intervention, critical error, unauthorized disclosure, accessibility blocker, and notes. Acceptance requires at least four of five successes for every task, no critical error, and zero unauthorized disclosure. Any disclosure blocks closeout and returns to the owning story.

## Approval record

Approval must identify this exact commit and both source hashes, accepted variances, production route, synthetic-only scope, and protocol. Until an authorized human records that approval and it is reconciled with the human work board, Story 30.2 remains backlog.

### Reviewer response template

```text
Decision: APPROVE | APPROVE WITH AMENDMENTS | REJECT
Approver name and role:
Candidate: 4370cac3f77d1ed9a10c069aaebaab470f9e69c7
Workspace source SHA-256: 7de47369664ae59e067f3b9d9ea17c173c1affab7733a8ef341bea593e1a3639
Style source SHA-256: c0e5536779a0116305d0c460b98553aebb7972015cb5fcb94197c33d6f3015ba
Route/scope accepted: /dashboard; explicit non-production synthetic mode only
Variances accepted or amended:
Five-person protocol accepted or amended:
Notes:
```

An approval authorizes the design baseline and declared variances only. It does not mark Story 30.2 Done, approve authorization policy, authorize publication, or satisfy later implementation, accessibility, live-database, CI, human-study or release gates.
