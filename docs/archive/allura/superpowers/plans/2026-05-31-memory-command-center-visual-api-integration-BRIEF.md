# Memory Command Center Visual/API Integration Brief

## Objective

Make the Allura Memory frontend visually match the approved brand identity screenshots while keeping the Memory Command Center connected to real governed APIs.

This is not a generic admin dashboard. It should not look like stock shadcn. It must feel like a desktop control center for managed AI memory: governed, calm, premium, auditable, and memory-first.

Reference screenshots:

- `/home/ronin704/Downloads/Allura-Exports/Allura — Brand Identity/image 1.png`
- `/home/ronin704/Downloads/Allura-Exports/Allura — Brand Identity/image 2.png`
- `/home/ronin704/Downloads/Allura-Exports/Allura — Brand Identity/image 3.png`
- `/home/ronin704/Downloads/Allura-Exports/Allura — Brand Identity/image 4.png`
- `/home/ronin704/Downloads/Allura-Exports/Allura — Brand Identity/image 5.png`

## Source Of Truth

Hierarchy:

1. Figma owns brand, components, colors, typography, spacing, and visual system where Figma provides actual assets or frames.
2. AionUI owns the desktop shell, sidebar structure, chat/task layout, and agent workspace patterns.
3. Notion owns specs, decisions, epics, work items, route planning, and governance requirements.
4. GitHub owns implementation, branches, validation, and deployable artifacts.

Current local sources:

- Figma asset file: `https://www.figma.com/design/DsCWyaq4W9xHzcFhCQEIPL`
- Persisted Figma assets: `public/brand/**`
- Exported screenshots: `/home/ronin704/Downloads/Allura-Exports/Allura — Brand Identity/**`
- AionUI source: `/media/ronin704/Games/Projects/ai-agents/aion`
- Product intent: `docs/allura/BLUEPRINT.md`
- UX/API behavior: `docs/allura/DESIGN-ALLURA.md`
- Requirement mapping: `docs/allura/REQUIREMENTS-MATRIX.md`
- Risks and decisions: `docs/allura/RISKS-AND-DECISIONS.md`
- Data contracts: `docs/allura/DATA-DICTIONARY.md`
- Existing implementation plan: `docs/superpowers/plans/2026-05-29-branded-memory-dashboard.md`
- Existing dashboard files: `src/app/dashboard/**`, `src/components/dashboard/**`, `src/lib/dashboard/**`

Known source caveat:

- The Figma URL currently exposes a `Logos` page only, not the full dashboard frame set. Treat it as brand-asset canon, not complete layout canon, unless additional Figma frames are provided.
- The Notion plan must be used when available through configured Notion tooling. Do not web-fetch Notion URLs.

## Requirements

- Match the visual direction in the screenshots: warm cream background, navy text, restrained cards, left navigation, Allura wordmark/mark usage, blue/orange/green/gold functional colors, and dense operator surfaces.
- Use real Allura assets only. Do not create, trace, or approximate a new logo.
- Fork and brand AionUI into Allura Memory. Replace AionUI branding, logo assets, colors, typography, labels, and placeholder product language with approved Allura system language.
- Update sidebar and routes to match the Notion plan and Captain direction.
- API data must come through `src/lib/dashboard/**` adapters/mappers and typed contracts.
- Every dashboard route must show active `group_id`, source of truth, freshness, and degraded state.
- Mutation surfaces must show or produce intent, actor, source, policy, validation, and audit receipt.
- Unknown/degraded/empty states must be visible. Do not fabricate healthy/live/synced metrics.
- Memory must be the main product, not a hidden feature. Governance must be visible, not buried.
- Every screen should communicate auditability, confidence, lineage, evidence, and control.

## Required Sidebar Structure

Mission Control:

- Overview
- Agent Status
- Sessions
- Scheduled Tasks

Memory:

- Memory Inbox
- Episodic Memory
- Semantic Memory
- Knowledge Graph
- Dreams
- Promotions
- Memory Search
- Memory Analytics

Agents:

- Team RAM
- Managed Agents
- Agent Registry
- Agent Contracts
- Agent Skills

Governance:

- Audit Log
- Memory Lineage
- Gate Violations
- Evidence Chains
- Policy Center

Operations:

- MCP Services
- Model Routing
- API Health
- Background Jobs
- Logs

Settings:

- Tenant Configuration
- PROMOTION_MODE
- Model Endpoints
- Embedding Settings
- Users and Roles
- Notifications

## Backend/API Requirements

Connect governance screens to real backend surfaces:

- Audit Log -> `/api/events`
- Agent Contracts -> `/api/agents` and `/api/contracts`
- Memory Lineage -> `/api/memory/lineage`
- Gate Violations -> `/api/events` filtered
- Evidence Chains -> `/api/memory/lineage` deep trace
- Promotion History -> `/api/promotions`
- Policy Center -> `/api/policies`
- Approval and Revocation Controls -> `/api/policies` and `/api/promotions`

If an endpoint does not exist yet, create a typed adapter boundary that renders an intentional degraded/blocked state and records the missing backend contract. Do not fake success.

## Dreams Requirements

Dreams is Allura's background intelligence layer, not just scheduled tasks.

Dreams must show:

- Evidence
- Lineage
- Confidence score
- Recommended actions
- Governed outputs

AionUI Scheduled Tasks maps into Dreams and Background Jobs, but Allura Dreams must be more governed, auditable, and memory-aware.

## Login Requirement

Use the test login to confirm authentication. If login blocks development, temporarily disable it, document the reason, and keep moving. Do not let auth become a fake blocker.

## Per-Screen Merge Checklist

Each screen must have:

- Approved Figma reference.
- Figma tokens applied.
- AionUI structure mapped.
- Backend endpoint wired or intentionally mocked.
- Empty state.
- Loading/skeleton state.
- Error state.
- Responsive behavior.
- Screenshot comparison before merge.

## Team Dispatch

- TALON: implementation integrity, API wiring, validation, backend contracts, auth handling, and blockers.
- IRIS: visual fidelity, brand consistency, Figma comparison, design-token compliance, layout polish, and screenshot review.
- IRIS Brand Designer: visual parity and token/component guidance against Figma, screenshots, and AionUI shell patterns.
- IRIS CEO: product feel, workflow clarity, and release approval risk.
- TALON API Tester: route/API integration map, missing endpoints, and smoke-test plan.
- TALON Test Writer: route smoke and API-state regression coverage when implementation stabilizes.
- Durham/Claude/Figma: use only if a Figma URL or design source is available, or if screenshots conflict with repo brand canon.

## Verification Gates

- Phase 1: app launches as Allura Memory with no AionUI branding visible.
- Phase 2: full sidebar renders and all routes resolve.
- Phase 3: memory screens render with real or intentionally degraded/mocked data and Figma comparison is complete.
- Phase 4: governance screens connect to backend endpoints and approval/revocation controls work.
- Phase 5: settings persist correctly and `PROMOTION_MODE` reflects system state.
- Phase 6: every screen matches Figma/exported screenshots closely enough for approval.
- `bun run typecheck`
- `bun test src/__tests__/dashboard-contracts.test.ts`
- Dashboard route smoke for all approved routes.
- Browser screenshot proof for desktop and mobile.
- API proof that routes use real endpoint/adapters or clearly visible degraded states.
- IRIS should-ship verdict.
- TALON can-ship/API readiness verdict.
- Captain final approval before any release/deploy claim.

## Definition Of Done

- The implemented frontend visually aligns with the screenshot direction.
- The dashboard is not a static mock: APIs are connected or visibly degraded with source/freshness.
- Required routes render without console/runtime errors.
- Brand, accessibility, API, and evidence gates pass.
- Work is logged to Allura/daily notes and reflected in the plan evidence.
- Deliverables include before/after screenshots, completed API integrations, completed routes, login/auth status, blockers, validation evidence for navigation/data/backend health, and recommended next actions.
