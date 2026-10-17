<!-- Context: project-intelligence/decisions | Priority: high | Version: 2.0 | Updated: 2026-04-25 -->

# Decisions Log — allura Memory

> Records major architectural and business decisions. Prevents "why was this done?" debates.  
> Full decision history in Allura Brain: query `WHERE event_type = 'ARCHITECTURE_DECISION' AND agent_id = 'brooks'`

---

## Decision: Two-Layer Memory Architecture (PostgreSQL + RuVector)

**Date:** 2026-01-12  
**Status:** Decided  
**Owner:** Brooks (architect)

### Context
allura needs both an immutable audit trail and fast semantic search. A single database forces a trade-off between write-once reliability and query-time flexibility.

### Decision
PostgreSQL 16 for episodic append-only traces. PostgreSQL `graph_memories` / `graph_supersedes` with RuVector (pgvector) hybrid search for the versioned semantic layer. Both layers run in the same PostgreSQL instance in the Docker Compose stack.

### Rationale
- Postgres = truth: append-only events table, no UPDATE/DELETE ever
- RuVector hybrid search = speed: vector ANN + BM25 RRF fusion, `graph_supersedes` SUPERSEDES versioning
- Two layers enable HITL governance: raw trace → curator review → approved knowledge

### Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Single flat episodic table | Simplest schema | No semantic versioning, no curated canonical layer | Kills semantic search quality |
| Single mutable semantic store | One model | No append-only guarantee, harder audit compliance | Mutability risk for audit trail |

### Impact
- **Positive:** Audit + semantic precision coexist; SOC2-ready by default
- **Negative:** Two layers to keep consistent; more complex schema
- **Risk:** Drift between episodic events and the semantic layer (mitigated by curator pipeline)

---

## Decision: HITL Governance (SOC2 Mode)

**Date:** 2026-01-12  
**Status:** Decided  
**Owner:** Brooks

### Context
Enterprise customers require proof that AI agents cannot autonomously modify canonical knowledge. Without a human gate, allura is indistinguishable from any other memory store.

### Decision
`PROMOTION_MODE=soc2` routes high-confidence proposals to a pending queue. No semantic-layer write happens until a curator explicitly approves. `PROMOTION_MODE=auto` available for developer tier.

### Rationale
- Governance = differentiator vs mem0 (which has no approval flow)
- Append-only Postgres preserves all proposals for audit, regardless of approval
- `bun run curator:approve` / `bun run curator:reject` are the only sanctioned promotion paths

### Impact
- **Positive:** Enterprise compliance market; auditable knowledge lifecycle
- **Negative:** Adds latency for promoted knowledge in SOC2 mode
- **Risk:** Curators bottleneck if proposal volume spikes (mitigated by auto-promotion threshold)

---

## Decision: allura Name Casing

**Date:** 2026-04-24  
**Status:** Decided  
**Owner:** Brand (David Ogilvy persona)

### Context
Brand finalization required a consistent rule for how the product name appears in all copy.

### Decision
Always lowercase `allura` in running copy. `Allura Memory` in legal / title context only. Never `ALLURA`, never `The Allura`.

### Rationale
Phonoaesthetic: soft opening, liquid 'l', warm resonant tone. Lowercase reinforces approachability and warmth vs cold capitalized tech brands.

### Impact
- **Positive:** Consistent brand identity across all surfaces
- **Negative:** Agents and contributors must be reminded — easy to drift
- **Risk:** Template files or auto-capitalization may violate this (enforce with grep in CI if needed)

---

## Decision: Dashboard Course Correction (2026-04-25)

**Date:** 2026-04-25  
**Status:** Decided  
**Owner:** Brooks

### Context
A previous session erroneously cloned the Blazity/Vercel Next.js Enterprise Boilerplate into `apps/allura-dashboard`. The user's real working dashboard already existed at `src/app/(main)/dashboard` on `localhost:3100`.

### Decision
Remove `apps/allura-dashboard` (the mistaken scaffold). The canonical dashboard lives at `src/app/(main)/dashboard`. Port 3100 is the Allura Dashboard; there is no separate Paperclip product.

### Rationale
Conceptual integrity: one dashboard, one codebase. The mistaken clone created a parallel surface with different assumptions (external boilerplate deps) that contaminated the session context. The dashboard is the Allura Dashboard — a TypeScript enterprise dashboard, not a separate product called "Paperclip".

### Impact
- **Positive:** Single dashboard surface; no competing assumptions
- **Negative:** Lost the session exploring the boilerplate setup
- **Risk:** None — the real dashboard is preserved and unmodified

---

## Decision: MCP Docker CLI Check Opt-In

**Date:** 2026-04-25  
**Status:** Decided  
**Owner:** Brooks

### Context
`scripts/test-mcp-browser.ts` was conflating an optional external `mcp-docker` CLI status check with browser/dev-server validation. The repository aliases `@mcp-docker` imports to local Vitest mocks, so `bun x mcp-docker status` is not a normal prerequisite and caused false failures.

### Decision
Skip MCP Docker CLI check by default. Require `USE_REAL_MCP_DOCKER=true` env var to opt into real Docker MCP validation. Keep canonical Streamable HTTP test as the protocol gate.

### Rationale
Fewer confusing pre-conditions = cleaner developer experience. Protocol health is already validated by the dedicated Streamable HTTP integration test (12/12 passing).

### Impact
- **Positive:** `bun run test:mcp` gives actionable output without a running Docker MCP server
- **Negative:** Real Docker MCP integration requires explicit opt-in — slightly less default coverage
- **Risk:** Developers may forget `USE_REAL_MCP_DOCKER=true` for full integration testing

---

## Decision: Bun-Only Runtime

**Date:** 2026-01-12  
**Status:** Decided  
**Owner:** Sabir (user)

### Context
Zero-trust supply chain policy. npm/npx introduce risk via network-fetched executables and unpinned package resolution.

### Decision
Bun is the only permitted package manager and runtime. `npm`, `npx`, `pnpm`, `yarn` are banned.

### Rationale
Bun's lockfile model + supply chain isolation. Faster than Node for scripts. All CLAUDE.md instructions enforce this.

### Impact
- **Positive:** Reproducible installs; no npm supply chain exposure
- **Negative:** Some npm-only tools require alternatives or wrapping
- **Risk:** Contributors may accidentally run npm — catch with `bun run lint`

---

## Deprecated Decisions

| Decision | Date | Replaced By | Why |
|----------|------|-------------|-----|
| `roninclaw-*` group_id namespace | 2026-01-12 | `allura-*` | Tenant namespace aligned to product name |
| Local allura-memory MCP server | 2026-04-19 | MCP_DOCKER tools | Docker-backed servers only; local MCP retired |
| apps/allura-dashboard (Vercel boilerplate) | 2026-04-25 | `src/app/(main)/dashboard` | Mistaken parallel scaffold; removed |

---

## Related Files

- `technical-domain.md` — technical implementation affected by these decisions
- `business-tech-bridge.md` — business rationale behind technical choices
- `living-notes.md` — current open questions that may become decisions
- `docs/allura/RISKS-AND-DECISIONS.md` — full AD/RK register with formal schema
