# Epic 30 My Work — Current Design Approval Packet

Date: 2026-09-17  
Status: **approval requested; not approved**  
Candidate commit: `e65598e9a1c8c1f1f34b2eaf1ae825c0a7b56598`  
Production route: `/dashboard`, only when explicit non-production Epic 30 synthetic mode is enabled.

This packet replaces the repaired candidate at `f6c94f6` as the current visual baseline. It records what exists and the remaining variances; it does not grant design, story, human-study, or release acceptance.

## Bound artifacts

| Artifact                                                | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/components/dashboard/my-work-workspace.tsx`        | `be13eb353d9ae523993cd773d208eea4092ea56d2d78de0ba190e61ba4d79719` |
| `src/components/dashboard/my-work-workspace.module.css` | `926f289dd75850ab3bda40d5f939920801342648951241608bf49e2ac1a85f64` |
| Desktop ready screenshot                                | `586a6a26e2e509f546e354bd5cbd1c0f7e902e182e6cf746dae8468c6df8270b` |
| Desktop comparison screenshot                           | `47e4cf252041cc71e4f342e042429df65dd8105adfb554dd9eb28eacc3943fa6` |
| 320 px ready screenshot                                 | `e6d199945b44bb9619f5948b26b663739043c12fef9054f6301d693b27a93f57` |
| 320 px comparison screenshot                            | `16e96e7f9bbce842a3d76d608ef07c87f122a415d788baf41d36c0609ad07a61` |

The screenshots are stored under `../implementation-artifacts/evidence/epic30-design-e65598e9/`. They were captured from a temporary non-shipping route that rendered the same committed component with synthetic `.invalid`-equivalent fixture content. The temporary route was removed after capture. No production data or model was attached.

## Current design

- Obsidian-inspired, Allura-branded knowledge workspace with a compact tool rail, authorized private/department tree, document reading pane, co-visible context pane, outline/access inspector, and collapsed Ask rail.
- Allura Ink/Cream foundation with Blue for memory/intelligence, Orange for review emphasis, and Green for authorized visibility. The official Allura lettermark is used without modification.
- One primary document and at most one comparison pane. Closing comparison returns keyboard focus to its opener or the main article fallback.
- The context pane is explicitly labelled `PROXIMITY ONLY`; node position does not assert a link or verified relationship.
- Search remains disabled and Ask remains unavailable until their later authorization and provider gates are implemented.
- Ready, authorized-empty, and fail-closed-unavailable states exist. No production fallback is used.

## Variance record

| Epic expectation                    | Current candidate                                                                                                                | Required disposition                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Memory tabs                         | Tab-like chrome identifies the open document and context pane, but is not an interactive memory-tab system                       | Implement and verify under Story 30.7, or approve a documented variance                                         |
| Authorized search and relationships | Search is disabled; the context pane shows co-visible records without relationship claims                                        | Implement under Story 30.8                                                                                      |
| Read-only cited Ask                 | Rail is present and truthfully unavailable; no content is transmitted                                                            | Implement only after Story 30.9 provider and authorization gates                                                |
| Restricted contractor messaging     | Tool-rail affordance is absent; no messaging is performed                                                                        | Implement under Story 30.10                                                                                     |
| Eight truth states                  | Ready, empty, and unavailable are implemented                                                                                    | Loading, forbidden, stale, degraded, conflict, and error/complete distinctions require contract-driven coverage |
| Accessibility                       | Semantic navigation/article/aside structure, named controls, focus restoration, and responsive 320 px layout are locally covered | Screen-reader journey and real 200% browser zoom evidence remain required                                       |
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
