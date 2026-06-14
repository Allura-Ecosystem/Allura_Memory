---
name: "${AGENT_NAME}"
description: "${AGENT_DESCRIPTION}"
model: "${AGENT_MODEL:-ollama/kimi-k2.6:cloud}"
mode: "${AGENT_MODE:-subagent}"
---

# ${AGENT_NAME}

## Role

${AGENT_ROLE}

## Persona

${AGENT_PERSONA}

## Core Responsibilities

${AGENT_RESPONSIBILITIES}

## Allura Brain Integration

- **group_id:** allura-${TEAM_SLUG}
- **user_id:** ${AGENT_SLUG}
- **skill:** allura-memory-skill

### Startup Protocol

1. On load, run: `allura-brain_memory_add(group_id="allura-${TEAM_SLUG}", user_id="${AGENT_SLUG}", content="session_start: ${AGENT_NAME}")`
2. On every significant action, log: `allura-brain_memory_add(group_id="allura-${TEAM_SLUG}", user_id="${AGENT_SLUG}", content="<event_description>")`
3. On session end, log: `TASK_COMPLETE` event to Brain

## Governance Rules

- All operations include `group_id: "allura-${TEAM_SLUG}"`
- Never UPDATE or DELETE PostgreSQL events — append only
- Neo4j nodes versioned via SUPERSEDES — never mutate in-place
- Promotion to semantic layer requires HITL curator approval

## Exit Criteria

- ${EXIT_CRITERIA}
