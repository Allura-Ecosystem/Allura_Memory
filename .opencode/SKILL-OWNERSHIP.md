# Skill Ownership Matrix

| Skill | Owner | Trigger | Required? | Overlaps With | Decision |
|-------|-------|---------|-----------|---------------|----------|
| allura-approve-promotion | Brooks | HITL approval | ✅ Yes | allura-propose-promotion | **Keep** — promotion pipeline |
| allura-design | Durham agents | Brand/design tasks | ⬜ Overlay | huashu-design, figma-* | **Keep** — Allura-specific brand design |
| allura-graph-debug | Bellard | Neo4j debugging | ⬜ Overlay | none | **Keep** — Neo4j diagnostics |
| allura-health-observability | Hightower | Health checks | ⬜ Overlay | none | **Keep** — infra monitoring |
| allura-memory-skill | Scout | Any Brain operation | ✅ Yes | none | **Keep** — mandatory Brain governance |
| allura-menu | All | Navigation | ⬜ Overlay | none | **Keep** — Brain menu system |
| allura-propose-promotion | Brooks | Memory promotion | ✅ Yes | allura-approve-promotion | **Keep** — promotion pipeline |
| agent-builder | Brooks | Agent skill build/edit/analyze | ⬜ Overlay | skill-creator | **Keep** — agent construction for Team RAM |
| brainstorming | Woz | Design exploration | ⬜ Overlay | frontend-design, allura-design | **Keep** — ideation and concept development before design |
| bun-security | Hightower | Security audit | ⬜ Overlay | none | **Keep** — Bun security checks |
| code-review | Pike | Code review | ✅ Yes | none | **Keep** — review gate |
| context7 | Scout | Library docs | ✅ Yes | none | **Keep** — external context discovery |
| figma-code-connect | Woz | Figma→Code | ⬜ Overlay | figma-use, figma-implement | **Keep** — Figma integration |
| figma-create-new-file | Woz | Figma creation | ⬜ Overlay | none | **Keep** — Figma creation |
| figma-generate-design | Woz | Design generation | ⬜ Overlay | allura-design | **Keep** — Figma generation |
| figma-generate-library | Woz | Library generation | ⬜ Overlay | none | **Keep** — Figma library |
| figma-implement-design | Woz | Implementation | ⬜ Overlay | figma-code-connect | **Keep** — Figma implementation |
| figma-use | Woz | Figma inspection | ⬜ Overlay | none | **Keep** — Figma inspection |
| impeccable | Woz | Frontend polish/design | ⬜ Overlay | frontend-design, frontend-craft | **Keep** — production-grade frontend interface design |
| frontend-craft | Woz | Frontend engineering | ⬜ Overlay | frontend-design, impeccable | **Keep** — Brooksian frontend workflow, implementation companion |
| frontend-design | Woz | UI/UX design | ⬜ Overlay | brainstorming, huashu-design, impeccable | **Keep** — production-grade design for Next.js + Tailwind + ForceGraph2D |
| github | Pike | GitHub integration | ⬜ Overlay | code-review, mcp-docker | **Keep** — GitHub workflows, PRs, issues, secrets scanning |
| mcp-docker | All | MCP tool access | ✅ Yes | none | **Keep** — MCP gateway |
| mcp-docker-ops | Hightower | MCP server lifecycle | ✅ Yes | mcp-docker | **Keep** — skill-embedded MCP operations wrapper |
| mcp-harness | Hightower | MCP orchestration | ⬜ Overlay | mcp-docker, mcp-docker-ops | **Keep** — MCP server discovery and governance |
| multi-search | Scout | Web search | ✅ Yes | context7 | **Keep** — search capability |
| open-ralph-wiggum | Brooks | Ralph Loop execution (`ralph`, `/ulw-loop`) | ⬜ Overlay | none | **Keep** — bounded autonomous execution loop with hard stop criteria |
| party-mode | Brooks | Parallel dispatch | ⬜ Overlay | roundtable, mcp-harness | **Keep** — Team RAM surgical team coordination |
| postgres-best-practices | Knuth | DB patterns | ⬜ Overlay | none | **Keep** — PostgreSQL guidance |
| quick-update | Scout | Doc sync | ⬜ Overlay | allura-memory-skill | **Keep** — quick documentation updates from memory context |
| roundtable | Brooks | Multi-agent discussion | ⬜ Overlay | party-mode | **Keep** — conversational multi-agent panel, complements execution-focused party-mode |
| security-bluebook-builder | Pike | Security policy | ⬜ Overlay | code-review | **Keep** — threat model, auth, audit, retention policy |
| skill-creator | Brooks | Skill authoring | ⬜ Overlay | mcp-harness | **Keep** — skill creation and optimization workflow |
| task-creator | Woz | Task generation | ⬜ Overlay | task-management | **Keep** — structured task creation with Brain integration |
| task-management | Woz | Task CLI | ⬜ Overlay | task-creator, allura-memory-skill | **Keep** — feature subtask tracking with memory linkage |
| team-ram-cowork | Brooks | Codex/OpenCode/Claude co-work explanation and role routing | ✅ Yes | party-mode, roundtable | **Keep** — explains and enforces Team RAM perspective workflow across tools |
| varlock | Hightower | Env var security | ⬜ Overlay | bun-security | **Keep** — secrets management and non-exposure guardrails |

| allura-team-ram | Brooks | Allura workflow governance core | ✅ Yes | allura-memory-skill, team-ram-cowork | **Keep** — mandatory governance layer for all allura-* skills |
| allura-dev-story | Woz | Governed story implementation | ✅ Yes | allura-team-ram | **Keep** — Allura-governed story implementation |
| allura-code-review | Pike | Governed code review | ⬜ Overlay | allura-team-ram | **Keep** — Allura-governed code review |
| allura-architecture | Brooks | Governed architecture creation | ⬜ Overlay | allura-team-ram | **Keep** — Allura-governed architecture |
| allura-product-intake | Jobs | Governed PRD creation | ⬜ Overlay | allura-team-ram | **Keep** — Allura-governed product intake |
| allura-retrospective | Brooks | Governed retrospective | ⬜ Overlay | allura-team-ram | **Keep** — Allura-governed retrospective |

**Total: 44 skills** — 9 Required (core gates), 35 Overlay (project-specific)

**Deleted / archived:**
- `systematic-debugging-memory` — archived to `.opencode/archive/skills-2026-05-07/`
- `executing-plans` — removed (orphan)
- `plugin-creator` — removed (orphan)
- `subagent-driven-development` — removed (orphan)
- `superpowers-memory` — removed (orphan)
- `trailofbits-audit` — removed (orphan)
- `writing-plans` — removed (orphan)
- `readme-memory` — removed (orphan)

**Ghost entries removed:**
- `penpot-design` — referenced in manifest but never on disk; removed from manifest.json
- `memory-client` — former name for `allura-memory-skill`; table standardized

**Special attention items:**
- `allura-memory-skill`: Mandatory for all agents. Cannot be removed without breaking Brain integration.
- `open-ralph-wiggum`: Bounded loop execution tool; does not provide final authority or review.
- `context7` + `multi-search`: Both serve Scout's discovery role. context7 for library docs, multi-search for web search. Complementary, not overlapping.
- `figma-*` skills: 6 Figma skills may seem excessive, but each serves a distinct Figma API surface. Keep all.
- `penpot-design` and `mcp-docker-ops`: Skill-embedded MCP pattern examples. They may declare/allow tools, but activation still requires mcp-harness governance.
- Ralph-related: `ralph.md` is a command, not a skill. Ralph's execution is gated by the ContextScout + skill gate (R5).

---
*Generated: 2026-05-07 | Part of Skill Triage Run*
