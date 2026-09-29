<!-- Context: project-intelligence/bridge | Priority: high | Version: 2.0 | Updated: 2026-04-25 -->

# Business ↔ Tech Bridge — allura Memory

> Maps allura business needs to their technical decisions. Use this when a developer asks "why was this built this way?" or a stakeholder asks "why does this cost what it costs?"

---

## Core Mapping

| Business Need | Technical Solution | Why | Business Value |
|---------------|--------------------|-----|----------------|
| People own their data, not vendors | Self-hosted Docker Compose deployment | Can't guarantee sovereignty on SaaS infra | Sovereign memory — no vendor lock-in |
| Full audit trail for compliance | Append-only PostgreSQL events table (no UPDATE/DELETE) | Mutating records destroys audit chain | SOC2-ready; every write is permanent and traceable |
| AI memory that "shows its work" | Memory provenance tracked: source, created_at, conversation_id | People ask "how did it learn this?" — answer must be on demand | Trust through transparency |
| Warm consumer experience vs cold dashboards | No sidebar, search dominant, "Forget" not "Delete", provenance on expand | Sarah's Law: 2 minutes, no questions | Consumer adoption without onboarding docs |
| Enterprise SOC2 gate | HITL curator approval before any semantic-layer promotion | Agents cannot be trusted to autonomously update canonical knowledge | Compliance without custom code |
| Instant AI agent integration | 5-tool MCP API (`memory_add/search/get/list/delete`) matching mem0 UX | Agents already know mem0's contract; zero migration cost | Developer adoption without docs |
| Reversible memory (undo forget) | Soft-delete: append `memory_delete` event + `deprecated: true` on the `graph_memories` row | Postgres is append-only; nothing is truly deleted | 30-day recovery; no fat-finger fear |
| Knowledge that survives corrections | Versioning via SUPERSEDES edges in `graph_supersedes` (new version row, old version deprecated) | In-place edits destroy history | Auditable, reversible knowledge evolution |
| Prevent runaway agent writes | Budget + Circuit Breaker (`src/lib/budget/`, `src/lib/circuit-breaker/`) | Agents can loop; hard limits enforce safety | Cost control + data integrity |

---

## Feature Mapping

### Feature: Two-Layer Memory (PostgreSQL + RuVector)

**Business Context:**
- Users need: persistent, searchable memory that is both fast and precise
- Business goal: compete with mem0 while offering governance mem0 doesn't have
- Priority: core architecture — everything depends on this

**Technical Implementation:**
- PostgreSQL 16: append-only episodic traces (`events` table), raw audit log
- PostgreSQL `graph_memories` / `graph_supersedes` + RuVector hybrid search: versioned semantic layer (promoted, curated, SUPERSEDES)
- Wozniak mental model: append-only events = truth, RuVector hybrid search = speed

**Connection:** Without two layers, you can't have both audit immutability (append-only episodic events) and fast semantic search (versioned semantic layer with RuVector hybrid search). A single layer forces you to trade one for the other.

---

### Feature: HITL Curator Approval (SOC2 mode)

**Business Context:**
- Enterprise admins need: proof that no AI can autonomously modify canonical knowledge
- Business goal: enterprise compliance market (SOC2, audit log export)
- Priority: table stakes for enterprise tier

**Technical Implementation:**
- `PROMOTION_MODE=soc2` → scores >= threshold go to `proposals` table, not the semantic layer
- Curator dashboard: 3-tab workflow (Traces / Pending / Approved)
- Every approval/rejection logged to audit trail with curator ID + timestamp

**Connection:** Without HITL, allura is just another AI memory store. With HITL, it's the only one with a provable governance gate.

---

### Feature: Warm Consumer UI (`/memory`)

**Business Context:**
- Maya (primary persona) needs: an interface that feels personal, not like a database
- Business goal: consumer market beyond developers — Maya doesn't know what a group_id is
- Priority: differentiator vs developer-only tools

**Technical Implementation:**
- No sidebar — memory is the only screen
- Search dominant, full width
- Swipe left → Forget (mobile); hover → Forget link (desktop)
- Provenance on expand (not by default)
- "Your AI's notebook" framing in copy

**Connection:** Developer tools optimize for power; consumer tools optimize for trust. allura needs both because the same memory engine serves both markets.

---

## Trade-off Decisions

| Situation | Business Priority | Technical Priority | Decision | Rationale |
|-----------|-------------------|--------------------|----------|-----------|
| Delete button label | Warm copy ("Forget") | Technical accuracy ("Delete") | "Forget" wins (Jobs) | Consumer mental model > engineering precision |
| Auto-promote vs HITL | Speed for developers | Safety for enterprises | Both: `PROMOTION_MODE` env var | Don't force one persona's needs on the other |
| `group_id` in consumer UI | Hide complexity from Maya | Required for every DB op | Hidden — injected server-side | UI simplicity; invariant still enforced at schema level |
| apps/allura-dashboard | Separate UX surface | Dashboard already exists at src/app/(main)/dashboard | Removed apps/allura-dashboard | Conceptual integrity: one dashboard, one codebase |

---

## Common Misalignments to Watch

| Misalignment | Warning Signs | Resolution |
|--------------|---------------|------------|
| Agent writes directly to the semantic layer (bypass HITL) | Direct INSERT into `graph_memories` / `graph_supersedes` outside the curator flow | Route through `curator:approve`; never write the semantic layer from agent context in SOC2 mode |
| Consumer UI exposes `group_id`/`user_id` | Template fields visible in memory cards | Server Components inject these; never surface in consumer-facing markup |
| Treating Postgres events as mutable | UPDATE/DELETE on events table | Hard blocked by schema; if it appears in code, it's a bug |
| Dashboard routes with `/dashboard/paperclip` | Old Paperclip naming in routes | Real dashboard is `src/app/(main)/dashboard` on port 3100 — no `/paperclip` path exists |

---

## Related Files

- `business-domain.md` — business context and target users
- `technical-domain.md` — tech stack and architecture
- `decisions-log.md` — full decision history with rationale
- `docs/allura/BLUEPRINT.md` — canonical requirements (B1–B29, F1–F40)
- `docs/allura/RISKS-AND-DECISIONS.md` — architectural decisions and risk register
