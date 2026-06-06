---
name: mcp-docker-ops
description: Discover, configure, approve, and operate Docker-backed MCP servers through MCP Docker tooling. Trigger for MCP server discovery, configuration, activation, or health checks.
category: infrastructure
preferred_executor: hightower-devops
allowed-tools:
  - MCP_DOCKER_mcp-find
  - MCP_DOCKER_mcp-add
  - MCP_DOCKER_mcp-config-set
  - MCP_DOCKER_mcp-exec
---

# MCP Docker Ops Skill

Use this skill for MCP server lifecycle operations.

## Governance

- Hightower owns deployability and runtime health.
- Brooks approves architectural MCP additions.
- No MCP server is auto-loaded solely because a skill declares it.
- Prefer one canonical MCP path over overlapping tools.
