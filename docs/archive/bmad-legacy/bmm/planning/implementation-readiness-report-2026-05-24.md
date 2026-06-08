---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
includedDocuments:
  prd:
    - docs/goal.md
    - _bmad/bmm/planning/source-docs/PRD-TEAM-RAM-v1.md
    - _bmad/bmm/planning/source-docs/PRD-DESIGN-SYSTEM-v1.md
  architecture:
    - docs/allura/BLUEPRINT.md
    - docs/allura/SOLUTION-ARCHITECTURE.md
    - docs/allura/DESIGN-ALLURA.md
    - docs/allura/DATA-DICTIONARY.md
    - docs/allura/REQUIREMENTS-MATRIX.md
    - docs/allura/RISKS-AND-DECISIONS.md
  epics:
    - _bmad/bmm/planning/epics.md
  ux:
    - docs/design/DASHBOARD-VISUAL-SPEC-v2.md
  governance:
    - _bmad/FINISH-ALL-EPICS-WORKFLOW.md
    - _bmad/ALLURA-NAVIGATOR-WORKFLOW.md
    - _bmad/TEAM-RAM-INTEGRATION.md
    - .opencode/guidelines/AI-GUIDELINES.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-24
**Project:** Allura Memory

## Step 1: Document Discovery

### Discovery Scope

BMAD planning artifact root from `_bmad/bmm/config.yaml`:

```text
_bmad/bmm/planning
```

Only `_bmad/bmm/planning/epics.md` exists under the BMAD planning root. The readiness assessment therefore includes canonical project documents from the configured `project_knowledge` list and canonical `docs/allura/` sources.

### PRD / Product Scope Documents

- `docs/goal.md` — product goal, roadmap, phase status, source-of-truth model.
- `_bmad/bmm/planning/source-docs/PRD-TEAM-RAM-v1.md` — Team RAM PRD; draft input with known path/source-of-truth/write-back drift caveats.
- `_bmad/bmm/planning/source-docs/PRD-DESIGN-SYSTEM-v1.md` — design system PRD; draft input with pending design review.

### Architecture Documents

- `docs/allura/BLUEPRINT.md` — primary design intent and requirements source.
- `docs/allura/SOLUTION-ARCHITECTURE.md` — topology and integration constraints.
- `docs/allura/DESIGN-ALLURA.md` — functional design for dashboard, curator, settings, and governance surfaces.
- `docs/allura/DATA-DICTIONARY.md` — schema and field-level authority.
- `docs/allura/REQUIREMENTS-MATRIX.md` — requirements traceability surface.
- `docs/allura/RISKS-AND-DECISIONS.md` — AD/RK decision and risk surface.

### Epics and Stories

- `_bmad/bmm/planning/epics.md` — BMAD-generated epics and stories; 5 epics, 21 stories, Allura drift gate included.

### UX Design Documents

- `docs/design/DASHBOARD-VISUAL-SPEC-v2.md` — active dashboard visual target.

### Workflow / Governance Context

- `_bmad/FINISH-ALL-EPICS-WORKFLOW.md` — canonical finish-all-epics workflow.
- `_bmad/ALLURA-NAVIGATOR-WORKFLOW.md` — board/context/governance/evidence operating loop.
- `_bmad/TEAM-RAM-INTEGRATION.md` — Team RAM + BMAD operating bridge.
- `.opencode/guidelines/AI-GUIDELINES.md` — professor/Carlos documentation standard: six canonical `docs/allura/` artifacts, AI disclosure, traceability matrix, data dictionary, risks/decisions, cross-reference, and review rules.

### Duplicates and Critical Issues

- No whole/sharded duplicate document conflicts were found in `_bmad/bmm/planning`.
- PRD, Architecture, and UX documents are not mirrored into `_bmad/bmm/planning`; the assessment uses canonical project sources listed above.
- `PRD-TEAM-RAM-v1.md` and `PRD-DESIGN-SYSTEM-v1.md` are explicitly draft inputs, not final specifications.
- Notion Work Board remains the planning/status/approval source of truth. Local BMAD artifacts are reconciliation/support artifacts.
- The professor/Carlos AI Guidelines are essential BMAD governance input. They constrain `docs/allura/` to the six canonical architecture artifacts and require AI disclosure plus Requirements Matrix/Data Dictionary/Risks updates when requirements, schemas, APIs, or architectural decisions change.

## PRD Analysis

### Functional Requirements

FR1: Allura must let an operator answer what the Brain knows.

FR2: Allura must let an operator answer why the Brain believes a memory or claim.

FR3: Allura must let an operator answer who approved a memory, decision, or promotion.

FR4: Allura must let an operator answer what changed and prove it with evidence.

FR5: Agents must be able to retrieve the right project context without guessing.

FR6: Humans must be able to inspect every important memory, decision, and promotion.

FR7: Raw traces must stay separate from curated truth.

FR8: Notion, GitHub, repo docs, and Allura Brain receipts must agree.

FR9: New boards must be addable later without hardcoding private business workflows.

FR10: Phase 1 must create a generic board engine: a shared renderer and data model for configured boards.

FR11: Phase 1 must provide a dynamic `/boards/[boardId]` route that loads board config by ID.

FR12: Phase 1 board configs must be Zod-validated, and invalid configs must fail safely and loudly.

FR13: Phase 1 must provide sanitized example board configs containing no private business data.

FR14: Phase 1 must support private board configs stored in gitignored paths.

FR15: Every board must declare its source of truth and write policy.

FR16: Boards must show blocked, degraded, and empty states honestly.

FR17: Board config validation and route loading must be covered by tests.

FR18: Adding a new board must be documented step by step.

FR19: Phase 2 must add a board switcher for the Mission Control multi-board cockpit.

FR20: Phase 2 must add a board status model.

FR21: Phase 2 must show source-of-truth badges.

FR22: Phase 2 must add degraded-state UI.

FR23: Phase 2 must add blocked-state UI.

FR24: Phase 2 must add board evidence panels.

FR25: Phase 2 must add an adapter declaration per board.

FR26: Phase 2 must add no-fabricated-data checks.

FR27: Phase 2 must validate desktop and mobile layouts.

FR28: Phase 2 must record screenshot evidence.

FR29: Phase 3 must standardize evidence comments.

FR30: Phase 3 must standardize Brain receipt format.

FR31: Phase 3 must standardize waiver format.

FR32: Phase 3 must activate or formally defer the cost ledger.

FR33: Phase 3 must complete the owner map.

FR34: Phase 3 must normalize decision log format.

FR35: Phase 3 must normalize rollback and supersession records.

FR36: Phase 3 must add governance tests where practical.

FR37: Phase 3 must document review gates.

FR38: Phase 4 must complete route parity before dashboard cutover.

FR39: Phase 4 must complete visual parity before dashboard cutover.

FR40: Phase 4 must complete source-of-truth parity before dashboard cutover.

FR41: Phase 4 must complete adapter declarations before dashboard cutover.

FR42: Phase 4 must prove there is no fabricated live data before dashboard cutover.

FR43: Phase 4 must complete authenticated validation before dashboard cutover.

FR44: Phase 4 must complete unauthenticated validation before dashboard cutover.

FR45: Phase 4 must complete smoke tests before dashboard cutover.

FR46: Phase 4 must complete runtime health checks before dashboard cutover.

FR47: Phase 4 must document a rollback command before dashboard cutover.

FR48: Phase 4 must record Captain approval before replacing `3100`.

FR49: Phase 5 must confirm owner and source of truth for each domain board.

FR50: Phase 5 must create private config first for domain boards.

FR51: Phase 5 may create a sanitized public example only when needed and after source-owner approval.

FR52: Phase 5 must define evidence expectations for domain boards.

FR53: Phase 5 must define write policy for domain boards.

FR54: Phase 5 must define degraded behavior for domain boards.

FR55: Phase 5 must add domain-board tests.

FR56: Phase 5 must attach Notion evidence before activating any domain board.

FR57: Phase 6 must update README and product docs.

FR58: Phase 6 must review security and privacy docs.

FR59: Phase 6 must review install and deployment docs.

FR60: Phase 6 must confirm sample data is safe.

FR61: Phase 6 must confirm no secrets or private board data are tracked.

FR62: Phase 6 must confirm CI is green.

FR63: Phase 6 must run the final Team RAM retrospective.

FR64: Phase 6 must log the final release receipt to Allura Brain.

FR65: Every user request in Team RAM must be routed to the right specialist within 30 seconds.

FR66: Agent outputs must be traceable to the agent, skill, and context that produced them.

FR67: No single agent may autonomously modify architecture, security, or governance rules.

FR68: Multi-agent tasks must complete with consistent, non-conflicting outputs.

FR69: Agent failures must be isolated so one agent crashing cannot bring down the system.

FR70: New agents must be addable without modifying existing agent definitions.

FR71: Agent definitions must be stored as markdown with YAML frontmatter including name, description, tools, model, and mode.

FR72: Model assignments must be declared per agent with primary and fallback, not blanket defaults.

FR73: Tool restrictions must be enforced per agent through deny lists that prevent overreach.

FR74: A skill ownership matrix must map skills to preferred executors.

FR75: Agent runtime state, confidence, and contributions must be trackable in Neo4j.

FR76: Team RAM routing must classify requests into architecture, implementation, review, research, infrastructure, and data categories.

FR77: Team RAM must select the primary agent by role, not only by model capability.

FR78: Explicit user requests to route to a specific agent must take precedence.

FR79: Fallback recovery must use declared fallback models only, with no multi-hop fallback chains.

FR80: Party mode must launch two or more agents simultaneously for complex tasks.

FR81: Review agents Pike and Fowler must pass before commit.

FR82: Scout must load local context and Allura Brain before any build.

FR83: Significant Team RAM responses must begin with a Brooks receipt.

FR84: Every task must show a Scout recon receipt covering local context, Brain query, and skills loaded.

FR85: Every mutation must show a RuVix governance receipt covering mutate, attest, verify, isolate, sandbox, and audit.

FR86: Every significant action must be logged to the governed memory/audit layer.

FR87: Every substantive response must end with a standardized reflection block when the Brooks protocol applies.

FR88: Agent failures must escalate to Brooks with context and must not silently fail.

FR89: Pike must provide read-only architecture consultation before any API change.

FR90: Fowler must provide maintainability review before any structural change.

FR91: Bellard diagnostics must provide performance measurement before any optimization claim.

FR92: Carmack must provide latency analysis before any speed-related decision.

FR93: Jobs must provide scope control and acceptance criteria before implementation.

FR94: Team RAM implementation tasks must follow ContextScout-first gating: local context, Brain search, skill resolution, builder execution, and validation.

FR95: Allura Brain project work must retrieve recent activity/blockers, query architecture insights/decisions, synthesize active/blocking/decided state, and use `docs/allura/` canon.

FR96: Team RAM must preserve HITL control for critical decisions.

FR97: The design system must define a color system with semantic roles: primary, secondary, success, warning, danger, info, and neutral.

FR98: The design system must define a 12-grade typography scale using the Inter font family.

FR99: The design system must define a 4px-based spacing scale with 24 steps and semantic names.

FR100: The design system must define a shadow system with five elevations: card, hover, modal, dropdown, and tooltip.

FR101: The design system must define border-radius tokens for buttons, cards, panels, and modals.

FR102: The component library must include a StatusBadge component with active, pending, approved, rejected, and deprecated states using color and icon.

FR103: The component library must include a ConfidenceBar component that displays 0-100% with red below 60, amber from 60-80, and green above 80.

FR104: The component library must include a TraceCard component showing tool-call name, input snippet, timestamp, and agent avatar.

FR105: The component library must include an EmptyState component with warm text, optional CTA, and no error icons.

FR106: The component library must include a PanelDrawer component that is 420px on desktop and 100% width on mobile with lazy loading.

FR107: The component library must include a MemoryCard component composing StatusBadge, ConfidenceBar, memory text, and actions.

FR108: The component library must include a GraphTab component with ForceGraph2D visualization of the Neo4j semantic graph and node interactions.

FR109: The dashboard must include a Mission Control shell with header, sidebar, and main content area.

FR110: The dashboard must include section tabs for Memories, Insights, Trace Logs, Provenance, Extracted Facts, and Approval Queue.

FR111: The dashboard must include metric cards for memory count, pending proposals, approval rate, and graph nodes.

FR112: The dashboard must include an activity feed with chronological event timeline and status indicators.

FR113: The dashboard must include scoped search with a `group_id` filter and hybrid vector/text search behind the scenes.

FR114: The dashboard must support desktop persistent sidebar, tablet collapsible sidebar, and mobile bottom navigation.

FR115: The curator interface must include a queue table with pending proposals and sortable confidence, agent, date, and type columns.

FR116: The curator interface must include proposal detail view with full memory text, provenance chain, evidence cards, and confidence history.

FR117: The curator interface must include Approve, Reject, Deprecate, and Edit action buttons using the specified visual treatments.

FR118: The curator interface must support batch operations with multi-select, bulk approve/reject, and confirmation modal.

FR119: The curator interface must include an audit trail sidebar showing who approved what, when, with Ed25519 signature when implemented.

FR120: The Figma design file must be organized into Brand Identity, Design Tokens, Components, Dashboard Pages, Responsive States, and Prototypes sections.

FR121: Figma artifacts must include design tokens JSON, a published component library, Mission Control wireframe, Curator flow prototype, responsive mockups, and accessibility audit report.

FR122: Design prototypes must include Curator Approval Flow, Memory Search Flow, and Graph Exploration Flow.

Total FRs: 122

### Non-Functional Requirements

NFR1: Allura Memory must be a governed, stable AI memory operating system before new board or product expansion work starts.

NFR2: AI memory must be persistent, inspectable, and accountable.

NFR3: Allura Brain raw memory must not be treated as proof of Done.

NFR4: Private board data must not be shipped in the public repository.

NFR5: AI must not decide compliance, finance, or owner policy without explicit human approval.

NFR6: The current `3100` dashboard must not be replaced until cutover gates pass.

NFR7: Notion Work Board is the canonical authority for Ready, In Progress, Review, and Done status.

NFR8: GitHub PRs/checks are the code-proof authority for what changed and whether CI accepted it.

NFR9: Repo docs are stable canon for architecture, decisions, requirements, and runbooks.

NFR10: Allura Brain is an audit-memory layer for searchable traces, lessons, and receipts.

NFR11: RuVix governs intent, evidence, validation, isolation, and audit.

NFR12: AI-assisted work must state intent before changing code, docs, config, memory, or board state.

NFR13: AI-assisted work must hydrate context before important action.

NFR14: Source documents, code, tests, and board state must be preferred over memory recall when conflicts exist.

NFR15: Allura Brain memory use must specify `group_id: allura-system` when memory tools are available.

NFR16: No tool, check, agent, or validation may be claimed unless it actually ran.

NFR17: AI-shaped documentation must include AI-assisted disclosure blocks.

NFR18: Code, schemas, and team consensus take precedence when docs conflict.

NFR19: Private or customer-specific board content must not be created in public docs.

NFR20: Humans must remain in the loop for owner decisions, compliance decisions, and scope calls.

NFR21: Every closure claim must include RuVix `mutate`, `attest`, `verify`, `isolate`, `sandbox`, and `audit` evidence.

NFR22: Team RAM routing must reduce communication overhead and preserve conceptual integrity through Brooks as chair.

NFR23: Context7 documentation lookup is required before proposing or editing external tool behavior, runtime configuration, provider/model syntax, library APIs, framework behavior, plugin hooks, MCP configuration, or CLI semantics.

NFR24: Ralph may not execute without context loaded, Brain memories checked, required skills loaded, and validation commands identified.

NFR25: Team RAM memory promotion criteria require decisions reusable across two or more projects, validation, and no duplicate semantic memory.

NFR26: The design system must establish trust and governance authority through visual language.

NFR27: The dashboard must surface critical memory health and curation status at a glance.

NFR28: The curator interface must make approval/rejection decisions feel consequential and safe.

NFR29: All design surfaces must meet WCAG 2.1 AA accessibility standards.

NFR30: The design system must scale from single-agent to enterprise multi-tenant deployments.

NFR31: Brand identity must differentiate Allura from generic AI-tool aesthetics.

NFR32: Text/background color contrast must meet WCAG 2.1 AA 4.5:1.

NFR33: All interactive elements must be keyboard accessible under WCAG 2.1 AA 2.1.1.

NFR34: Focus indicators must meet WCAG 2.1 AA 2.4.7 with a 2px deep-navy outline.

NFR35: Status badges and confidence bars must expose ARIA labels and satisfy WCAG 2.1 AA 1.3.1.

NFR36: Motion must respect `prefers-reduced-motion` under WCAG 2.1 AA 2.3.3.

NFR37: Mobile touch targets must be at least 44x44px under WCAG 2.1 AA 2.5.5.

NFR38: Responsive breakpoints must support Desktop XL at 1440px+, Desktop at 1280px, Tablet at 768px, and Mobile at 375px.

NFR39: ForceGraph2D graph visualization must account for performance targets for graphs larger than 1000 nodes, although the target remains an open question.

NFR40: Design outputs must support review and iteration because both PRD design inputs are draft/pending review.

NFR41: BMAD stories must follow the professor/Carlos AI Guidelines: no non-canonical files in `docs/allura/`, AI-modified docs keep disclosure, requirements and design changes remain cross-referenced, and schema/API changes update Requirements Matrix, Data Dictionary, and Risks & Decisions in the same work slice.

Total NFRs: 41

### Additional Requirements

- Phase 0 is closed, and Phase 1 is unblocked.
- Current deferred or pending items from `docs/goal.md` remain relevant planning constraints: cost ledger deferred to Phase 3, domain boards deferred until owner/source approval, and dashboard cutover pending multiple Phase 4 gates.
- Candidate domain boards include Memory Board as current, Faith Meats Operations as deferred, and Lending Compliance as deferred.
- Canonical ports are `6420` for visual/reference memory dashboard, `3334` for Mission Control development integration target, and `3100` for current Docker dashboard and future dashboard UI cutover target.
- Team RAM PRD references include known drift: `.opencode/agent/**` is the live agent source, while several PRD links still point at `.claude` or `.agents` adapter/mirror paths.
- Team RAM write-back examples use event names and MCP examples that must be checked against current schemas before implementation.
- The design-system PRD is explicitly a working design reference pending design-team review.
- Design open questions remain unresolved: dark mode scope, motion budget, ForceGraph2D performance target for >1000 nodes, native mobile vs responsive web, and tenant-specific white-label support.
- Team RAM open questions remain unresolved: A2A Agent Cards, dynamic spawning vs static roster, agent-to-agent memory scoping, human override path, and agent performance metrics.
- Professor/Carlos AI Guidelines are now included as BMAD governance input and must be treated as the documentation standard for future stories.

### PRD Completeness Assessment

The PRD corpus is broad enough to drive traceability, but it is not clean enough to serve as final implementation authority without architecture/schema reconciliation. `docs/goal.md` provides the strongest product and governance baseline. `PRD-TEAM-RAM-v1.md` and `PRD-DESIGN-SYSTEM-v1.md` provide useful requirement inventories, but both are explicitly draft documents. The principal readiness risks are path drift, event-schema drift, unresolved design/team operating questions, and the need to reconcile draft PRD claims against live `.opencode/agent/**`, JSON schemas, source code, Notion board state, and the canonical architecture documents before stories are marked Ready.

## Epic Coverage Validation

### Epic FR Coverage Extracted

The epics document contains its own 25-item FR inventory and maps those FRs to epics as follows:

- Epic 1 covers BMAD/Team RAM/governance/source-of-truth and semantic integrity: epics FR1, FR5, FR7, FR8, FR16, FR17, FR18, FR19, FR20, FR23, FR24.
- Epic 2 covers governed dashboard foundation and route boundaries: epics FR10, FR11, FR12, FR13, FR14.
- Epic 3 covers read-side memory search, detail, listing, provenance, and export/copy: epics FR2, FR3, FR4, FR25.
- Epic 4 covers curator workflow and HITL promotion gates: epics FR6, FR9.
- Epic 5 covers runtime reliability, cutover, Phase 0 closure protection, finish order, and closeout evidence: epics FR15, FR21, FR22.

Total FRs in epics: 25 local epics-FRs. These do not have 1:1 numbering with the 122 PRD FRs extracted in Step 2, so coverage below compares by requirement meaning rather than matching numbers.

### Coverage Matrix

| PRD FR | Requirement | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR1 | Operator can answer what Brain knows | Epic 3 search/list/detail | Covered |
| FR2 | Operator can answer why Brain believes it | Epic 3 provenance/evidence | Covered |
| FR3 | Operator can answer who approved it | Epic 4 decision receipts | Covered |
| FR4 | Operator can answer what changed/proof | Epic 1 evidence packets; Epic 5 final evidence | Covered |
| FR5 | Agents retrieve context without guessing | Epic 1 Scout/Brain drift gates | Covered |
| FR6 | Humans inspect memory/decision/promotion | Epics 3-4 | Covered |
| FR7 | Raw traces separate from curated truth | Epic 1 semantic integrity; Epic 4 HITL | Covered |
| FR8 | Notion/GitHub/docs/Brain receipts agree | Epic 1 and Epic 5 evidence/traceability | Covered |
| FR9 | New boards without hardcoded private workflows | Not covered by current 5-epic plan | Missing |
| FR10 | Generic board engine | Not covered | Missing |
| FR11 | `/boards/[boardId]` dynamic route | Not covered | Missing |
| FR12 | Zod board-config validation | Not covered | Missing |
| FR13 | Sanitized board examples | Not covered | Missing |
| FR14 | Gitignored private board configs | Not covered | Missing |
| FR15 | Board source/write policy declarations | Partly reflected in source-of-truth contracts, not board engine | Partial |
| FR16 | Board blocked/degraded/empty states | Dashboard degraded states only | Partial |
| FR17 | Board validation/route tests | Not covered | Missing |
| FR18 | Step-by-step board docs | Not covered | Missing |
| FR19 | Board switcher | Not covered | Missing |
| FR20 | Board status model | Not covered | Missing |
| FR21 | Source-of-truth badges | Partly via dashboard/source declarations | Partial |
| FR22 | Degraded-state UI | Epic 2 dashboard degraded states | Covered |
| FR23 | Blocked-state UI | Epic 2 dashboard honest states | Covered |
| FR24 | Board evidence panels | Not covered | Missing |
| FR25 | Adapter declaration per board | Epic 5 adapter declarations generally | Partial |
| FR26 | No-fabricated-data checks | Epics 2 and 5 | Covered |
| FR27 | Desktop/mobile layout validation | Epic 2 visual contract; not explicit screenshot matrix | Partial |
| FR28 | Screenshot evidence | Epic 5 final evidence; not route-specific | Partial |
| FR29 | Standardize evidence comments | Epic 1 evidence packets | Covered |
| FR30 | Standardize Brain receipt format | Epic 1 evidence packets; drift gate | Partial |
| FR31 | Standardize waiver format | Epic 5 waivers/deferrals | Partial |
| FR32 | Activate or defer cost ledger | Not covered explicitly | Missing |
| FR33 | Complete owner map | Not covered explicitly | Missing |
| FR34 | Normalize decision log format | Epic 1 evidence/gov docs partially | Partial |
| FR35 | Normalize rollback/supersession records | Epic 1 semantic versioning; Epic 5 rollback | Covered |
| FR36 | Governance tests where practical | Epics 1/4 targeted tests | Partial |
| FR37 | Document review gates | Epic 1 review/validation packets | Covered |
| FR38 | Route parity before cutover | Epic 5 | Covered |
| FR39 | Visual parity before cutover | Epic 5 | Covered |
| FR40 | Source-of-truth parity before cutover | Epic 5 | Covered |
| FR41 | Adapter declarations before cutover | Epic 5 | Covered |
| FR42 | No fabricated live data before cutover | Epics 2 and 5 | Covered |
| FR43 | Authenticated validation before cutover | Epic 5 cutover criteria | Covered |
| FR44 | Unauthenticated validation before cutover | Epic 5 cutover criteria | Covered |
| FR45 | Smoke tests before cutover | Epic 5 | Covered |
| FR46 | Runtime health before cutover | Epic 5 | Covered |
| FR47 | Rollback command before cutover | Epic 5 | Covered |
| FR48 | Captain approval before replacing `3100` | Epic 5 closeout approval | Covered |
| FR49 | Domain-board owner/source confirmation | Not covered | Missing |
| FR50 | Private config first for domain boards | Not covered | Missing |
| FR51 | Sanitized public example after approval | Not covered | Missing |
| FR52 | Domain-board evidence expectations | Not covered | Missing |
| FR53 | Domain-board write policy | Not covered | Missing |
| FR54 | Domain-board degraded behavior | Not covered | Missing |
| FR55 | Domain-board tests | Not covered | Missing |
| FR56 | Domain-board Notion evidence | Not covered | Missing |
| FR57 | Update README/product docs | Not covered explicitly | Missing |
| FR58 | Review security/privacy docs | Not covered explicitly | Missing |
| FR59 | Review install/deployment docs | Epic 5 runtime reliability partially | Partial |
| FR60 | Confirm sample data is safe | No-fabricated/private-data guard partially | Partial |
| FR61 | Confirm no secrets/private board data tracked | Not covered explicitly | Missing |
| FR62 | Confirm CI green | Epic 5 regression evidence | Covered |
| FR63 | Final Team RAM retrospective | Story 5.4 | Covered |
| FR64 | Final Brain release receipt | Story 5.4 | Covered |
| FR65 | Route user request to specialist in 30s | Epic 1 Team RAM routing; no 30s acceptance metric | Partial |
| FR66 | Trace agent outputs to agent/skill/context | Epic 1 evidence packets | Covered |
| FR67 | No single-agent autonomous governance changes | Epic 1 global contracts | Covered |
| FR68 | Multi-agent tasks consistent/non-conflicting | Epic 1 review gates partially | Partial |
| FR69 | Isolate agent failures | Not covered explicitly | Missing |
| FR70 | Add new agents without modifying existing definitions | Not covered explicitly | Missing |
| FR71 | Agent definitions as markdown/YAML frontmatter | Story 1.2 path/source contract partially | Partial |
| FR72 | Per-agent model assignments | Story 1.2 may harden PRD, but not implementation | Partial |
| FR73 | Per-agent tool restrictions | Story 1.2 may harden PRD, but not validation | Partial |
| FR74 | Skill ownership matrix | Story 1.2 may harden PRD, but not validation | Partial |
| FR75 | Agent status tracking in Neo4j | Not covered explicitly | Missing |
| FR76 | Intent classification categories | Epic 1 routing lifecycle partially | Partial |
| FR77 | Role-first routing | Epic 1 routing lifecycle | Covered |
| FR78 | User route override precedence | Not covered explicitly | Missing |
| FR79 | Fallback-only recovery | Not covered explicitly | Missing |
| FR80 | Party mode parallel dispatch | Epic 1 Team RAM lifecycle partially | Partial |
| FR81 | Pike/Fowler before commit | Epic 1 review gate | Covered |
| FR82 | Scout context before build | Epic 1 | Covered |
| FR83 | Brooks receipt | Story 1.2 PRD/routing contract partially | Partial |
| FR84 | Scout recon receipt | Epic 1 drift/evidence gate | Covered |
| FR85 | RuVix mutation receipt | Epic 1 evidence packets | Covered |
| FR86 | Significant action logged to memory/audit | Epic 1 evidence packets; Story 5.4 | Covered |
| FR87 | Reflection block | Not covered explicitly | Missing |
| FR88 | Agent failure escalation | Not covered explicitly | Missing |
| FR89 | Pike before API change | Epic 1 review gates | Covered |
| FR90 | Fowler before structural change | Epic 1 review gates | Covered |
| FR91 | Bellard before optimization claim | Not covered explicitly | Missing |
| FR92 | Carmack before speed decision | Not covered explicitly | Missing |
| FR93 | Jobs before implementation | Epic 1 Team RAM lifecycle | Covered |
| FR94 | ContextScout-first implementation sequence | Epic 1 | Covered |
| FR95 | Brain retrieval order/project synthesis | Epic 1 drift gate | Covered |
| FR96 | HITL for critical decisions | Epic 1 and Epic 4 | Covered |
| FR97 | Semantic color system | Not covered explicitly | Missing |
| FR98 | 12-grade Inter typography scale | Not covered explicitly | Missing |
| FR99 | 4px/24-step spacing scale | Not covered explicitly | Missing |
| FR100 | Five-elevation shadow system | Not covered explicitly | Missing |
| FR101 | Border-radius tokens | Not covered explicitly | Missing |
| FR102 | StatusBadge component | Not covered explicitly | Missing |
| FR103 | ConfidenceBar component | Not covered explicitly | Missing |
| FR104 | TraceCard component | Not covered explicitly | Missing |
| FR105 | EmptyState component | Epic 2 empty/degraded states, not component contract | Partial |
| FR106 | PanelDrawer component | Not covered explicitly | Missing |
| FR107 | MemoryCard component | Epic 3 memory detail/listing, not component contract | Partial |
| FR108 | GraphTab component | Epic 2/3 graph-safe states, not component contract | Partial |
| FR109 | Mission Control shell | Epic 2 dashboard shell | Covered |
| FR110 | Dashboard section tabs | Epic 2 route availability partially | Partial |
| FR111 | Metric cards | Epic 2 panels partially | Partial |
| FR112 | Activity feed | Not covered explicitly | Missing |
| FR113 | Scoped search with group_id | Epic 3 scoped search | Covered |
| FR114 | Responsive dashboard behavior | Epic 2 visual contract partially | Partial |
| FR115 | Curator queue table | Epic 4 proposal queue | Covered |
| FR116 | Proposal detail view | Epic 4 receipts and queue, partially | Partial |
| FR117 | Curator action buttons | Epic 4 actions | Covered |
| FR118 | Curator batch operations | Not covered explicitly | Missing |
| FR119 | Audit trail sidebar/signature | Epic 4 receipts; Ed25519 not covered | Partial |
| FR120 | Figma file organization | Not covered | Missing |
| FR121 | Figma deliverables | Not covered | Missing |
| FR122 | Design prototypes | Not covered | Missing |

### Missing Requirements

#### Critical Missing FRs

FR9-FR18: Generic board engine, dynamic board route, Zod validation, sanitized examples, private configs, source/write declarations, board-state rendering, tests, and board docs.
- Impact: `docs/goal.md` names Phase 1 as the Board Config System, but the current 5-epic BMAD plan is centered on Team RAM, governed dashboard, memory provenance, curator flow, and cutover evidence. If Phase 1 board-config work is still in scope for this readiness run, the plan omits the main Phase 1 feature set.
- Recommendation: Add a dedicated Board Config System epic or explicitly defer Phase 1 board-config requirements outside this BMAD plan.

FR49-FR56: Domain board governance requirements.
- Impact: Domain boards are a future/deferred scope, but they are still present in the PRD corpus. Without explicit deferral, coverage appears incomplete.
- Recommendation: Mark domain-board requirements as deferred in this readiness report and require a future epic only after owner/source approval exists.

FR97-FR108 and FR120-FR122: Design-token, component-library, Figma organization, and prototype deliverables.
- Impact: The design-system PRD contains a component/token/Figma workstream that is not represented as implementation stories. Dashboard visual compliance alone does not satisfy a design-system buildout.
- Recommendation: Either add a Design System Foundation epic or explicitly classify the design-system PRD as future design-team input, not current implementation scope.

#### High Priority Missing FRs

- FR19-FR21 and FR24-FR28: Mission Control multi-board cockpit details are only partially covered; board switcher/status/evidence panels remain uncovered.
- FR32-FR33 and FR57-FR61: governance/release hygiene items are partially absent, especially cost ledger, owner map, README/product docs, security/privacy docs, sample safety, and secret/private-data scans.
- FR69-FR80, FR83, FR87-FR88, FR91-FR92: Team RAM operational details such as agent failure isolation, runtime extensibility, user override precedence, fallback-only recovery, reflection protocol, and diagnostics/performance gates are not fully represented as story acceptance criteria.
- FR112 and FR118: dashboard activity feed and curator batch operations are absent from the current stories.

### Coverage Statistics

- Total PRD FRs: 122
- FRs fully covered in epics: 52
- FRs partially covered in epics: 25
- FRs missing from epics: 45
- Coverage percentage, full only: 42.6%
- Coverage percentage, full + partial: 63.1%

### Coverage Assessment

The current BMAD epics cover the governed memory core, dashboard honesty, read-side provenance, curator HITL flow, and final cutover evidence. They do not fully cover the broader PRD corpus, especially the Phase 1 generic board engine, deferred domain boards, and design-system/Figma component library. Brooks recommendation: before implementation, decide whether this readiness run is scoped to the current 5-epic memory/dashboard finish plan or to the full PRD corpus. If it is the full corpus, add epics before proceeding. If it is the 5-epic finish plan, explicitly mark board-engine/domain-board/design-system work as deferred or out of scope for this implementation tranche.

## UX Alignment Assessment

### UX Document Status

Found, with caveat.

- No UX document exists under the configured BMAD planning artifact path `_bmad/bmm/planning` for the searched patterns `*ux*.md` or `*ux*/index.md`.
- UX documentation does exist in canonical/supporting project docs:
  - `docs/design/DASHBOARD-VISUAL-SPEC-v2.md` — active dashboard visual target.
  - `docs/allura/DESIGN-ALLURA.md` — functional dashboard, curator, settings, state, API, and component design.
  - `docs/allura/SOLUTION-ARCHITECTURE.md` — dashboard/Mission Control route topology, source-of-truth constraints, cutover gates, and interface boundaries.

### Alignment Issues

1. **Planning-location mismatch:** Step 4 search found no UX artifact in `_bmad/bmm/planning`, even though Step 1 selected `docs/design/DASHBOARD-VISUAL-SPEC-v2.md` as the active UX source. This is acceptable only if the readiness workflow treats canonical external docs as included sources; otherwise the BMAD planning package lacks local UX.

2. **Dashboard route vocabulary drift:** `DASHBOARD-VISUAL-SPEC-v2.md` defines `/dashboard`, `/dashboard/memory-space`, `/dashboard/agents`, `/dashboard/insights`, `/dashboard/builder`, and `/allura`. `DESIGN-ALLURA.md` also describes older or broader surfaces such as `/dashboard/curator`, `/dashboard/audit`, `/dashboard/traces`, `/dashboard/graph`, `/dashboard/projects`, `/dashboard/skills`, `/dashboard/feed`, and Mission Control routes such as `/command`, `/work-board`, `/telemetry`, and `/resources`. `SOLUTION-ARCHITECTURE.md` further states that `6420` is historical/reference, `3334` is retired development integration evidence, and `3100` is canonical local dashboard target. These route sets need an explicit current-route authority before implementation stories treat route names as acceptance targets.

3. **Visual spec vs functional design tension:** `DASHBOARD-VISUAL-SPEC-v2.md` says `/dashboard/health`, `/dashboard/feed`, `/dashboard/settings`, `/dashboard/decisions`, and `/dashboard/projects` are not in this phase. `DESIGN-ALLURA.md` still lists health, audit, settings, graph, agents, projects, skills, and feed pages as dashboard architecture. This is not necessarily wrong, but it requires phase scoping so builders do not resurrect old surfaces.

4. **PRD design-system scope exceeds current epics:** `PRD-DESIGN-SYSTEM-v1.md` requires design tokens, brand components, Figma library organization, responsive mockups, and prototypes. The current epics mostly cover dashboard visual compliance, empty/degraded states, memory/provenance surfaces, and curator actions. They do not fully cover the design-system deliverables.

5. **Activity feed conflict:** The design-system PRD lists an activity feed as a dashboard layout requirement, and `DESIGN-ALLURA.md` includes `ActivityPanel`. `DASHBOARD-VISUAL-SPEC-v2.md` says `/dashboard/feed` is Phase 4+ and not in this phase. Epic 2 does not explicitly include activity feed, so this should be marked deferred or added.

6. **Curator batch operations gap:** `PRD-DESIGN-SYSTEM-v1.md` requires batch approve/reject with confirmation modal. Epic 4 covers queue, approve/reject, request evidence, and receipts, but not batch operations.

7. **Accessibility alignment is partial:** PRD and UX docs require WCAG 2.1 AA, keyboard reachability, focus trap/restore, reduced motion, and 44x44 mobile targets. Epic acceptance criteria explicitly mention keyboard reachability and focus for curator actions, but do not yet comprehensively map color contrast, reduced motion, screen-reader labeling, and touch-target validation to story-level tests.

### Warnings

- The UX direction is user-facing and mandatory; absence of a BMAD-local UX artifact should not be treated as absence of UX requirements.
- The active UX authority for the dashboard is `docs/design/DASHBOARD-VISUAL-SPEC-v2.md`, but it has `Approved by: Captain (pending)`. Any Done claim depending on visual acceptance should require Captain/IRIS sign-off or a documented waiver.
- The current epics align well to the dashboard honesty and memory governance UX, but they do not fully align to the broader design-system/Figma PRD. Decide whether design-system work is in scope before implementation begins.
- Route and port language must be normalized before route implementation: current docs mention `6420`, `3334`, `3100`, `/dashboard`, `/allura`, and Mission Control route sets with historical/contextual differences.

## Epic Quality Review

### Epic Structure Validation

| Epic | User Value Focus | Independence | Quality Finding |
| --- | --- | --- | --- |
| Epic 1: Team RAM Execution and Semantic Integrity | Partial. The user value is governance safety and trustworthy execution, but the title is architecture/process-heavy. | Strong. Later epics can depend on its gates and contracts. | Acceptable for a governance-heavy brownfield project, but title could be more operator-facing. |
| Epic 2: Governed Dashboard Foundation | Strong. Operator can see truthful dashboard state and approvals without fabricated data. | Moderate. It can function after Epic 1; it does not require Epics 3-5 for empty/degraded shell work. | Good user outcome, though some stories are foundation-heavy. |
| Epic 3: Memory Provenance and Review | Strong. Operator can search, inspect, copy/export, and verify memories. | Strong if Epic 1 group-scope baseline is complete. | Good user value and clear non-goal prevents mutation creep. |
| Epic 4: Curator Workflow and Promotion Gates | Strong. Curator can safely approve/reject/request evidence with receipts. | Strong if Epic 1 scope contracts and relevant schema are stable. | Good user value. Batch operations from PRD are missing but not a structural flaw if deferred. |
| Epic 5: Runtime Reliability, Cutover, and Final Evidence | Partial. User value is safe release/closeout, but much of the epic is operational/release governance rather than direct user functionality. | Dependent by design on prior epics; as final release epic this is acceptable if labeled as release/closeout. | Borderline technical epic, but acceptable in a brownfield finish plan because deployability/cutover is a user outcome for operators. |

### Story Quality Assessment

#### Strengths

- All 21 stories use an “As a / I want / So that” structure.
- Every story declares traceability from Epic -> FRs -> evidence artifact -> validation command.
- Acceptance criteria are generally BDD-shaped and testable.
- The plan correctly encodes global governance contracts: Notion as planning truth, Brain as audit context, HITL for promotion, append-only PostgreSQL, Neo4j `SUPERSEDES`, and Allura drift gate.
- Stories avoid direct autonomous promotion and generally preserve read/write boundaries.

#### Structural Issues

1. **Epic 1 is overloaded with governance foundations.** Stories 1.1-1.5 are all gate/contract/evidence work. That is appropriate for a brownfield governance system, but it delays visible product value. Mitigation: keep Story 1.1 and Story 1.2 as readiness blockers only if their outputs are genuinely required before memory/dashboard work.

2. **Story 1.1 may be larger than a normal story.** It requires a field-by-field compliance matrix across DATA-DICTIONARY, SQL DDL, JSON schema, Neo4j constraints, runtime code, drift log, enforcement checklist, and targeted tests. This is close to an audit epic. Recommendation: if implementation stalls, split into 1.1a schema/code drift matrix and 1.1b enforcement validation/tests.

3. **Story 5.2 is broad.** “Package Final Regression and Sprint Evidence” covers validation commands, pass/fail output, blockers, deferrals, Notion reconciliation, Brain receipts, and waiver decisions. This is acceptable as a closeout story but should not become a dumping ground for unfinished validation.

4. **Story 5.4 includes both retrospective and closeout decision.** This is acceptable only after all epics are done/waived/deferred. It should remain blocked until the evidence packet exists.

5. **Several stories reference Allura Brain drift checks before Done.** This is a cross-cutting gate, not a feature dependency. It is acceptable, but the execution template must avoid duplicating large drift procedures inside every story.

### Dependency Analysis

#### Within-Epic Dependencies

- Epic 1 sequencing is logical: 1.1 baseline -> 1.2 source-of-truth contract -> 1.3 sprint status -> 1.4 drift gate -> 1.5 evidence packets. No forward dependency detected.
- Epic 2 can start after Epic 1’s source-of-truth and drift gates. Stories 2.1-2.4 are ordered shell -> panels -> empty/degraded states -> route/cutover boundary. No forward dependency detected.
- Epic 3 can function after group-scope/search contracts are known. Stories 3.1-3.4 are ordered search/list -> detail -> export -> drift validation. No forward dependency detected.
- Epic 4 can function after scope/proposal invariants are known. Stories 4.1-4.4 are ordered queue -> actions -> request evidence -> receipts. No forward dependency detected.
- Epic 5 is intentionally dependent on previous epics and should be treated as release/closeout, not a standalone product increment.

#### Cross-Epic Dependencies

- Epic 2 depends on Epic 1 governance readiness, which is acceptable under the sequential independence rule because Epic 2 can use Epic 1 output.
- Epic 3 depends on Epic 1 group-scope enforcement, acceptable.
- Epic 4 depends on Epic 1 semantic integrity/HITL contracts, acceptable.
- Epic 5 depends on prior epics by nature of being final cutover/closeout; this should remain explicit and not be treated as an independent feature epic.

### Best Practices Compliance Checklist

| Epic | Delivers User Value | Can Function Independently in Sequence | Stories Sized | No Forward Dependencies | Tables Created When Needed | Clear ACs | Traceability |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Epic 1 | Partial | Yes | Mixed | Yes | N/A / audit only | Yes | Yes |
| Epic 2 | Yes | Yes, after Epic 1 | Yes | Yes | N/A | Yes | Yes |
| Epic 3 | Yes | Yes, after Epic 1-2 | Yes | Yes | N/A | Yes | Yes |
| Epic 4 | Yes | Yes, after Epic 1 | Yes | Yes | N/A | Yes | Yes |
| Epic 5 | Partial | Release-dependent | Mixed | Yes | N/A | Yes | Yes |

### Quality Findings by Severity

#### 🔴 Critical Violations

- **Scope coverage mismatch:** The current 5-epic plan does not cover the full 122-FR PRD corpus. This is critical only if the implementation tranche is intended to cover the full `docs/goal.md` + Team RAM PRD + Design System PRD scope. Missing areas include Phase 1 generic board engine, domain boards, and design-system/Figma library deliverables.

#### 🟠 Major Issues

- **Story 1.1 audit size risk:** Story 1.1 may be too large for a single implementation story and should be split if it blocks progress.
- **Design-system deliverables absent:** If `PRD-DESIGN-SYSTEM-v1.md` is in scope, there is no epic for tokens, component library, Figma organization, prototypes, or full accessibility audit.
- **Release hygiene coverage partial:** README/product docs, security/privacy review, sample safety, secret/private-data scan, cost ledger, and owner map are not all explicit stories.
- **Route vocabulary drift:** Dashboard, Mission Control, and historical route docs need a single current-route authority before implementation begins.

#### 🟡 Minor Concerns

- Epic 1 and Epic 5 titles are process/release oriented rather than user-action oriented.
- Some validation commands are placeholders or conditional and must be verified before moving stories to Ready.
- The Allura drift gate is repeated globally and inside many stories; story templates should link to one canonical gate rather than copying procedure text everywhere.

### Recommendations

1. Decide tranche scope before implementation: **5-epic memory/dashboard finish plan** vs **full PRD corpus**.
2. If full PRD corpus, add at least three epics before implementation: Board Config System, Design System Foundation, and Release/Governance Hygiene.
3. If 5-epic finish plan, explicitly mark generic board engine, domain boards, and design-system/Figma work as deferred/out of scope in the final readiness assessment.
4. Normalize dashboard route/port authority and Captain/IRIS visual approval state before any dashboard story moves to Ready.
5. Consider splitting Story 1.1 into two smaller stories if the field-by-field audit becomes a bottleneck.

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK**

The current 5-epic BMAD plan is coherent for a constrained memory/dashboard finish tranche, but it is **not ready as a full implementation plan for the complete PRD corpus**. The readiness decision turns on scope:

- If the implementation tranche is **the current 5-epic memory/dashboard finish plan**, the plan can proceed after scope deferrals and route/design authority are explicitly recorded.
- If the implementation tranche is **all requirements extracted from `docs/goal.md`, `PRD-TEAM-RAM-v1.md`, and `PRD-DESIGN-SYSTEM-v1.md`**, it is **not ready** because 45 of 122 PRD FRs are missing from epics and 25 are only partially covered.

### Critical Issues Requiring Immediate Action

1. **Scope mismatch between PRD corpus and epics.** The plan covers governed memory, dashboard honesty, read-side provenance, curator HITL, and final cutover evidence. It does not cover the generic board engine, dynamic `/boards/[boardId]`, board-config validation, domain-board governance, or full design-system/Figma deliverables.

2. **Route and authority drift.** Current docs mention several route sets and port meanings: `/dashboard`, `/dashboard/memory-space`, `/dashboard/agents`, `/dashboard/insights`, `/dashboard/builder`, `/allura`, `/dashboard/curator`, `/dashboard/audit`, `/command`, `/work-board`, `/telemetry`, `/resources`, `6420`, `3334`, and `3100`. A single current-route authority is required before route implementation.

3. **Draft PRDs cannot be final acceptance authorities yet.** Both `PRD-TEAM-RAM-v1.md` and `PRD-DESIGN-SYSTEM-v1.md` are explicitly draft/pending review. Team RAM PRD also contains known drift around `.opencode` vs `.claude`/`.agents` paths and stale write-back/event examples.

4. **Design-system scope unresolved.** Dashboard visual compliance is represented, but design tokens, component library, Figma organization, prototypes, batch curator operations, and full accessibility coverage are not represented as stories.

5. **Story 1.1 size risk.** The schema/enforcement audit story is valuable but large. It may need to be split to avoid becoming a tar pit before implementation begins.

### Recommended Next Steps

1. **Make a tranche-scope decision:** choose either “5-epic memory/dashboard finish plan” or “full PRD corpus.” Record the decision in the report/epics and Allura Brain.

2. **If using the 5-epic finish plan, explicitly defer out-of-scope PRD areas:** board engine, domain boards, design-system/Figma deliverables, activity feed, curator batch operations, and release hygiene items not represented in the stories.

3. **If using the full PRD corpus, add missing epics before implementation:** Board Config System, Design System Foundation, and Release/Governance Hygiene at minimum.

4. **Normalize dashboard route/port authority before Ready:** define active vs historical routes, source-of-truth per route, and the current meaning of `6420`, `3334`, and `3100`.

5. **Harden Story 1.1 and Story 1.2 first:** verify group-scope/schema enforcement and fix Team RAM PRD/source-of-truth drift before any memory/dashboard implementation story starts.

6. **Story 1.1 validation runner decision:** Ronin approved split validation for Story 1.1. Bun-native readiness tests run with `bun test src/lib/validation/group-id.test.ts src/lib/graph-adapter/neo4j-adapter.test.ts src/agents/memory-wrapper.test.ts src/lib/memory/__tests__/approval-audit.test.ts`; `src/__tests__/health-metrics-scope.test.ts` runs separately through `bun run test -- src/__tests__/health-metrics-scope.test.ts` because it uses Vitest `vi.hoisted`.

6. **Require visual approval or waiver:** because the active dashboard visual spec says Captain approval is pending, no dashboard story should be marked Done without IRIS/Captain sign-off or an explicit waiver.

### Final Note

This assessment identified **5 critical issue clusters**, **8 major coverage/quality gaps**, and **multiple minor cleanup concerns** across document discovery, PRD extraction, epic coverage, UX alignment, and epic quality. The plan has strong conceptual integrity for governed memory work, but like any good architecture it must say what it is *not* building. Address the scope and route-authority issues before proceeding to implementation, or explicitly accept them as deferred scope with owner approval.

**Assessment date:** 2026-05-24  
**Assessor:** Brooks / Codex runtime under Team RAM workflow  
**Report path:** `_bmad/bmm/planning/implementation-readiness-report-2026-05-24.md`
