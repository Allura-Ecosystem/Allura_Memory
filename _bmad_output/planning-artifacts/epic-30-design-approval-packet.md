# Epic 30 My Work — Current Design Approval Packet

Date: 2026-09-17; design decision recorded 2026-09-21
Status: **design baseline approved and reconciled with the human board; Story 30.2 acceptance pending**
Candidate commit: `4370cac3f77d1ed9a10c069aaebaab470f9e69c7`
Production route: `/dashboard`, only when explicit non-production Epic 30 synthetic mode is enabled.

This packet replaces the visual candidate at `7d657aba` with its independently reviewed successor at `4370cac3`. The design baseline and protocol received the bounded human decision below; this does not grant story, authorization-policy, human-study, or release acceptance.

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

| Epic expectation                    | Current candidate                                                                                                                                                              | Required disposition                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Memory tabs                         | Tab-like chrome identifies the open document and context pane, but is not an interactive memory-tab system                                                                     | Implement and verify under Story 30.7, or approve a documented variance                                         |
| Authorized search and relationships | Search is disabled; the context pane shows co-visible records without relationship claims                                                                                      | Implement under Story 30.8                                                                                      |
| Read-only cited Ask                 | Rail is present and truthfully unavailable; no content is transmitted                                                                                                          | Implement only after Story 30.9 provider and authorization gates                                                |
| Restricted contractor messaging     | Tool-rail affordance is absent; no messaging is performed                                                                                                                      | Implement under Story 30.10                                                                                     |
| Eight truth states                  | Ready, empty, and unavailable are implemented                                                                                                                                  | Loading, forbidden, stale, degraded, conflict, and error/complete distinctions require contract-driven coverage |
| Accessibility                       | Semantic landmarks, named/current-state controls, visible focus, 44 px targets, focus restoration, responsive 320 px layout, and automated WCAG A/AA scans are locally covered | Screen-reader journey and real 200% browser zoom evidence remain required                                       |
| Live synthetic proof                | Static synthetic rendering and focused unit tests pass                                                                                                                         | Restricted-role PostgreSQL/HTTP browser proof remains pending approved injected test credentials                |

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

Approval must identify this exact commit and both source hashes, accepted variances, production route, synthetic-only scope, and protocol. The chat decision below supplies the design decision and was reconciled with the human work board; the remaining Story 30.2 evidence is still required. Story 30.2 remains backlog.

### Recorded design decision — 2026-09-21

- **Decision:** APPROVE the exact current design baseline and five-person protocol, with no amendments. The user confirmed the candidate, listed variances and protocol, then reiterated “full approval” in this Codex task.
- **Approver:** Sabir Asheed, the project-configured user and named Story 30.2 design approver. The Codex chat decision was self-attested; the connected Notion account independently identified Sabir Asheed as the actor that recorded the matching board decision, not as a cryptographic signature on the chat.
- **Candidate:** `4370cac3f77d1ed9a10c069aaebaab470f9e69c7`.
- **Bound source hashes:** TSX `7de47369664ae59e067f3b9d9ea17c173c1affab7733a8ef341bea593e1a3639`; CSS `c0e5536779a0116305d0c460b98553aebb7972015cb5fcb94197c33d6f3015ba`. Screenshot and audit hashes are in the table above and were rechecked before this record.
- **Route and scope:** `/dashboard` only under the explicit non-production Epic 30 synthetic mode; no production deployment or live data approved.
- **Variance disposition:** Accept the candidate's documented present limitations as the design baseline, not as waivers of the epic requirements. Interactive tabs, authorized search/relationships, cited Ask, restricted contractor messaging, remaining truth states, and their authorization/proof gates remain assigned to Stories 30.7–30.10 and the relevant prerequisite stories. The mobile overlay contrast review, screen-reader journey, actual 200% browser zoom, and restricted-database browser proof remain open.
- **Protocol:** Accept the seven-task, five-distinct-person uncoached protocol above, including at least four successes per task, no critical error and zero unauthorized disclosure. No participant session is claimed complete.
- **Verification before record:** The maintained local unit/hermetic lane passed 88 tests across nine files and `bun run typecheck` passed on 2026-09-21. These are not live PostgreSQL/HTTP or hosted-CI results.
- **Human-board reconciliation:** [Notion Story 30.2](https://app.notion.com/p/3df1d9be65b381d1ad21fd045deb777e) was updated under authenticated actor Sabir Asheed (`525742f3-6861-4e17-a413-2e496ca70e21`). Its decision content, Decision Log and Handoff Context name candidate `4370cac3` and preserve the old `e65598e9` request as historical. Readback confirmed the decision section, exact candidate, and `Not Started` status on 2026-09-21. No other board item or lifecycle status was changed.

The approval permits design-baseline planning only. It does not approve the separate Story 30.3 authorization contract or independent security/data dispositions, advance a board status, complete Story 30.2, or authorize release.

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
