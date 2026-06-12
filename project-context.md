# Allura Memory — Project Context

## Stack
- **Runtime**: Next.js (Bun), port 3100 (dev) / Docker (prod)
- **Engine**: Allura Memory MCP Gateway, port 3201
- **Memory**: PostgreSQL (episodic), Neo4j (semantic), RuVector (embeddings)
- **Auth**: DevAuthProvider (dev), Clerk (production path)
- **Agent harnesses**: NanoClaw, OpenCode, Codex Claude, Claude Desktop, Google CLI

## Dashboard Pages (port 3100)
- /dashboard — redirects to feed
- /dashboard/search — memory search with filters/sort/pagination
- /dashboard/teams — team roster (hardcoded, needs API binding)
- /dashboard/scheduled-tasks — cron viewer
- /dashboard/governance — policy gates, curator queue (placeholder)
- /dashboard/dreams — auto-generated insights
- /dashboard/kanban — Kanban board (empty placeholder)
- /dashboard/graph — Neo4j knowledge graph visualization
- /dashboard/mission-control — operations console (empty placeholder)
- /dashboard/settings — static read-only config display

## Teams
- **RAM** — 10 agents, CLI harness (OpenCode/Claude Code)
- **Durham** — 9 brand agents, CLI harness
- **TALON** — 8 agents, native OpenClaw subagents (dev/shipping)
- **IRIS** — 9 agents, native OpenClaw subagents (UX/QA/brand)
- **Penasoto** — 7 mortgage audit agents (not yet deployed)
- **Raleigh** — 15 Faith Meats agents (not yet deployed)
- **Charlotte** — 6 Difference Driven agents (not yet deployed)

## Key Architecture
- Engine owns canon/gates — Dashboard consumes governed endpoints only
- Every agent action → append-only events → curator review → semantic promotion
- Nanoclaw integration: MCP gateway → managed agents → governed events → Kanban
