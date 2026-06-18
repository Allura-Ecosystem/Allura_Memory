# DESIGN-MEMORY-COMMAND-CENTER — Human Dashboard

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Anchor: [BLUEPRINT.md](./BLUEPRINT.md) (F16–F28). Related: [DESIGN-CURATOR.md](./DESIGN-CURATOR.md), [DESIGN-AUDIT.md](./DESIGN-AUDIT.md), [DESIGN-GUARD.md](./DESIGN-GUARD.md).

## Overview

The Memory Command Center is the human control plane (AD-08) for memory, agents, governance, and evidence. It is a **warm Memory Command Center**, not a cold admin panel. It always shows the active organization, workspace, and `group_id`, and surfaces an evidence path for every action.

## Functional Requirements

| ID | Implementation detail |
|----|-----------------------|
| F16/F19 | Memories screen exposes search/add/list/get with provenance + evidence drawers. |
| F20/F21/F23 | Curator screen surfaces pending proposals; approve/reject/request-evidence with rationale; promotion history. |
| F24/F25 | Audit screen shows full event log; CSV + receipt export. |
| F26/F27 | SDK/MCP screen: create token, copy config, test connection, install instructions. |

## Navigation & Screens

Primary nav: **Overview · Memories · Curator · Agents · Allura Guard · Audit · Workflows · Dream Cycles · SDK/MCP · Settings**.

| Screen | Shows |
|--------|-------|
| **Overview** | Active org/workspace/`group_id`; MCP, Postgres, Neo4j, embeddings health; pending reviews; connected agents; security warnings; recent activity. |
| **Memories** | Search-first; filters by layer/status/source/actor/score/workspace; provenance + evidence + audit-trail drawers; forget/recover. |
| **Curator** | Pending proposals; confidence; evidence preview; approve/reject/request-evidence; required rationale; promotion history. |
| **Agents** | Registry; type; token status; scopes; workspace; last seen; recent + denied actions; revoke/rotate. |
| **Allura Guard** | Users; roles; permissions; MCP tokens; API keys; denied actions; policies; rate limits; workspace locks. |
| **Audit** | Full event log; permit/deny/defer; actor/role/token/workspace/group_id; CSV + receipt export. |
| **Dream Cycles** | Dream runs; provider; sources; status; candidate breakdown; approval status; receipt link. |
| **SDK/MCP** | Create MCP token; copy config; test connection; SDK install; `allura doctor`. |

## Business Rules / Constraints

- Every screen calls the governed API; no direct DB access (AD-08, RK-10).
- Active workspace and `group_id` are always visible.
- Every mutation produces a receipt; every memory action shows its evidence path.

## Use Cases

- **CC-UC1:** Reviewer opens Curator, reviews a proposal with evidence, approves with rationale → promotion + receipt.
- **CC-UC2:** Admin opens Agents, sees a stale token, rotates it → audit event.
- **CC-UC3:** Operator opens Overview, sees Neo4j degraded → links to Ops runbook.

## Important Constraints

- Design tokens from the Allura brand kit; warm backgrounds, white cards, charcoal text, amber/orange primary, green approve, red danger.
- Accessibility (WCAG AA) target for the control plane.
