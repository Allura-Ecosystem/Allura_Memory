# GitHub Copilot Instructions

> [!NOTE]
> **AI-Assisted Documentation**
> Updated with Codex assistance on 2026-10-20; final human document review remains pending.
> Approved intent and observed implementation are distinct; record discrepancies for the responsible owner.

> [!IMPORTANT]
> This file configures GitHub Copilot behavior in this repository.

## AI-Assisted Documentation Policy

All code and documentation generated with AI assistance (GitHub Copilot, Claude, etc.) must:

1. **Include disclosure block** (see AI-GUIDELINES.md)
   - Added at top of file after title
   - Removed only after full human review

2. **Follow Brooksian principles**
   - AI assists implementation, not architecture
   - One human architect owns conceptual integrity
   - Never let AI decide system design alone

3. **Validate against source of truth**
   - Approved product decisions and canonical specifications establish intended behavior
   - Code, schemas and runtime checks establish observed implementation
   - Record and resolve disagreements; do not change intent merely to match code

## When Copilot Should Help

✅ Drafting initial document structure
✅ Generating field tables from schemas
✅ Cross-referencing existing documentation
✅ Formatting and spell-checking
✅ Naming conventions (following established patterns)

## When Copilot Should NOT Decide

❌ Architecture decisions (APIs, data models, system design)
❌ Security constraints or threat models
❌ Performance trade-offs
❌ Governance rules (HITL, curator approval gates)
❌ Naming conventions (must match existing patterns)

## Required Artifacts (Before Coding)

Canonical location: `docs/allura/`

- **BLUEPRINT.md** — Service purpose, concepts, requirements
- **SOLUTION-ARCHITECTURE.md** — Design decisions, trade-offs
- **DESIGN-ALLURA.md** — Component-level designs within the canonical six
- **REQUIREMENTS-MATRIX.md** — B# → code mapping
- **RISKS-AND-DECISIONS.md** — Architectural decisions and tradeoffs
- **DATA-DICTIONARY.md** — All entities and fields

Canonical surface rule: Do not create net-new files in `docs/allura/` beyond the canonical six. Route reports, deliverables, prompts, validation snapshots, and benchmarks to `docs/archive/allura/` or Allura Brain.

Read [AI-GUIDELINES](../guidelines/AI-GUIDELINES.md), especially [§11: Dashboard and Portfolio Preview](../guidelines/AI-GUIDELINES.md#11-allura-dashboard-and-portfolio-preview), before changing the dashboard. Reuse actual selected Studio Base UI page/widget compositions, preserve Allura Cream branding and shared sample relationships, and keep proposed UX slices separate from implemented preview behavior. Store overview's current reference is the React/Vite preview at `http://127.0.0.1:4008/index.html#ecommerce`; the older portable HTML awaits repackaging and separate verification. Real integrations and authorization require separately specified work.

For backend work, also follow [AI-GUIDELINES §12](../guidelines/AI-GUIDELINES.md#12-reliability-and-backend-adversarial-review). Test actual entrypoints, scope, bounded inputs, retries, concurrency and recovery; documentation or passing helper tests do not close open application findings.

## Review & Sign-Off

Every AI-assisted document requires:

1. PR review (human eyes on output)
2. Architectural sign-off (architect approves design intent)
3. Disclosure removal (only after sign-off)

Copilot output is a draft, not a final specification.

## Agent Harness Integration

This repository uses three AI harnesses:

- **Claude Code** (primary) — `.claude/` configuration
- **GitHub Copilot** — This file
- **OpenCode** — `.opencode/` configuration

All harnesses must reference AI-GUIDELINES.md and enforce disclosure requirements.

## Allura Brain

Allura Brain provides governed episodic and semantic context through authenticated MCP tools. Current storage is PostgreSQL: append-only events/traces, versioned semantic memory and graph relationships, with RuVector for embedding/search capabilities described by the canonical architecture. See [Solution Architecture](../docs/allura/SOLUTION-ARCHITECTURE.md) and [Data Dictionary](../docs/allura/DATA-DICTIONARY.md). Do not infer model, vector size, endpoint, health or permissions from an old instruction file.

### Retrieval and write boundaries

1. Read bounded local context and search relevant Brain context before planning. Use the authenticated scope; this project uses `group_id: allura-system`. A selected persona does not grant another tenant.
2. Use exposed governed MCP tools. Database operations go through MCP_DOCKER; never use shell/database access as a substitute for denied or missing tools.
3. Keep source authority separate from retrieval. A Brain result can be historical; canonical specifications and current owner decisions govern intent. A recall hit is not approval.
4. After substantive work, preserve an outcome with files, validation, remaining risk and evidence. Observe project idempotency/read-back rules; if the tool cannot satisfy them, retain a local receipt and report persistence as unconfirmed rather than inventing success.
5. Never autonomously promote semantic knowledge or publish to Notion. Source access is not transfer authority. Do not reroute a denied operation to another endpoint, credential or tenant.

## Brooks as Architect

Brooks is the project’s inspired AI architecture role; Sabir owns product intent and acceptance:

- Reviews all AI-assisted architecture decisions
- Maintains conceptual integrity across harnesses
- Identifies unresolved decisions; final human review is required before removing disclosure blocks
- Validates against Brooksian principles

Return unanswered correctness or design questions to the owning specification and decision owner. An agent verdict or receipt is not human approval.

## Key Patterns to Follow

### Immutable semantic versioning

Create a new semantic record and a PostgreSQL `graph_supersedes` relationship; never edit an existing semantic version in place. Events and traces are append-only. Follow the current [Data Dictionary](../docs/allura/DATA-DICTIONARY.md) rather than inventing schema or storage commands.

### group_id enforcement

Every database read/write carries the authorized `group_id` in the `allura-*` namespace. Tenant access is determined by the active credential and server, not by an agent persona or a sample dashboard role selector. Respect the project's separate Xterra boundary.

### HITL knowledge promotion

Human review is required for semantic promotion. A sample task moving to Done is neither curator approval nor a production authorization decision.

### ADR 5-Layer Framework

Every architectural decision captured with:

1. Action Logging
2. Decision Context
3. Reasoning Chain
4. Alternatives Considered
5. Human Oversight Trail

## Project-Specific Rules

1. Reuse existing local state and UI patterns; the portfolio preview uses shared React providers. Do not introduce a competing store or duplicate template fixtures for the same entities.
2. Use the selected Studio Base UI page components where available; preserve source revision, license and adapters. Existing Radix components elsewhere are not automatically migrated.
3. Persistence belongs to explicitly scoped application work. Current React preview shared sample state is local, survives navigation and resets on reload; no sign-in or backend work is implied.
4. Use authorized `group_id` scope for every database operation and append-only events/traces. Semantic changes create a new version and `graph_supersedes` relationship.
5. **Use Bun exclusively** for package operations; never use `npm` or `npx`. Reuse installed tooling and appropriate focused checks. A public template does not authorize dependency upgrades or production deployment.
6. Preserve the six canonical documents. Record implementation evidence outside `docs/allura/`; do not introduce a parallel memory-bank specification.
7. Prefer premade MCP servers from `MCP_DOCKER`; avoid custom wrappers when a catalog server already exists.
8. Report **intended → specified → implemented → verified → released** separately. Mark unbuilt Search everything, My day, Inbox, access-request and guided-demo ideas as proposals.

## Verification and outcome reporting

Inspect available MCP tool schemas before use; never invent calls, endpoints or authentication claims. Do not run direct container/database commands for verification. Follow [AI-GUIDELINES §11 validation](../guidelines/AI-GUIDELINES.md#validation-and-handoff) for preview changes. Check behavior as well as screenshots; a passed HTML build does not prove real authorization, a connected store or SOC 2 readiness controls.

Use the current [canonical design](../docs/allura/DESIGN-ALLURA.md) and evidence receipts for the bounded task. Preserve the actual runtime and distinguish local review, independent AI review and human sign-off.

## References

- [Memory Bank System - Tweag Agentic Coding Handbook](https://tweag.github.io/agentic-coding-handbook/WORKFLOW_MEMORY_BANK/)
- [How to Use a Memory Bank in Copilot](https://www.loom.com/share/152cea77575148b8af9fe8538ed30c30)
- [10x your Cursor Workflow with Memory Bank](https://www.youtube.com/watch?v=Uufa6flWid4)
