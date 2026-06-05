# Examples

Quick-start examples for Allura methodologies.

## First Memory — Store and Retrieve

```
// Store
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "brooks-architect",
  content: "ARCHITECTURE_DECISION: Use PostgreSQL for episodic memory."
})

// Search
allura-brain_memory_search({
  query: "architecture decision episodic",
  group_id: "allura-system",
  limit: 5
})

// List recent
allura-brain_memory_list({
  group_id: "allura-system",
  user_id: "brooks-architect",
  limit: 10,
  sort: "created_at_desc"
})
```

## First Story — From Backlog to Done

```
# 1. Jobs: Clarify intent and acceptance criteria
use allura-product-intake for "[feature description]"

# 2. Brooks: Approve architecture and route
use allura-architecture for "[feature scope]"

# 3. Woz: Implement with loaded context
use allura-dev-story for "[story title]"

# 4. Pike/Fowler: Review
use allura-code-review for "[branch/PR]"

# 5. Validate
bun test && bun run typecheck

# 6. Retro (after all stories in epic are Done)
use allura-retrospective for "[epic name]"
```

## First Architecture Decision

```
# 1. Scout hydration
Search Brain: "architecture decision [topic] blockers decisions"

# 2. Create ADR
use allura-architecture for "[decision topic]"

# 3. ADR template
### AD-XX: [Title]
- **Status**: Decided | Proposed
- **Decision**: [What was decided]
- **Rationale**: [Why]
- **Alternatives**: [What else was considered]
- **Consequences**: [What happens as a result]
```

## First Review — Pike + Fowler

```
use allura-code-review for "[branch name]"

Review layers:
1. Pike — Interface simplicity, API surface, contracts
2. Fowler — Maintainability, incremental change, reversibility

Output: Findings categorized by severity with actionable triage
```

## Promotion Pipeline — From Raw to Canonical

```
# Agent proposes
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "woz-builder",
  content: "Pattern: team-ram routing reduces rework by 40%",
  threshold: 0.85
})

# Curator inspects queue
# → Reviews evidence
# → Approves / Rejects / Requests Evidence
# → Approved memory promoted to Neo4j semantic layer
```

## Health Check

```
# Runtime diagnostics
use allura-health-observability

# Checks:
# - PostgreSQL reachable?
# - Neo4j reachable?
# - MCP gateway healthy?
# - Brain tools available?
# - Degraded state reported honestly
```
