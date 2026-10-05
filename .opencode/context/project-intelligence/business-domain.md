<!-- Context: project-intelligence/business | Priority: high | Version: 2.0 | Updated: 2026-04-25 -->

# Business Domain — allura Memory

> **Purpose**: Understand why allura exists, who it serves, and how it creates value.  
> **Update When**: Business direction changes, new features shipped, pivot.  
> **Brand canon**: `docs/branding/deliverables/06_allura-memory_brand-truth.json`

---

## Project Identity

```
Project Name:      allura (always lowercase) / Allura Memory (legal)
Tagline:           MEMORY THAT SHOWS ITS WORK
Positioning:       Warm + Connected — the AI memory layer for real life
Problem:           AI promised connection but delivered isolation. Memory is scattered,
                   opaque, and owned by vendors — not people.
Solution:          Sovereign, governed, self-hosted AI memory. Warm design. Full
                   auditability. People own their data.
Competitor:        mem0.ai (primary benchmark — 5-tool API parity is a hard requirement)
```

---

## Brand Archetype

**Caregiver 50% · Creator 30% · Explorer 20%**

| Trait | What It Means |
|-------|---------------|
| Warmth | Human-first design, not soulless tech |
| Craft | Intentional detail, no rough edges |
| Empowerment | Elevate community voices, not lock them in |
| Connection | Active bridge between people and their AI |

---

## Target Users

| Segment | Who They Are | What They Need | Pain Points |
|---------|--------------|----------------|-------------|
| **Primary — Maya** | Urban community organizer, 31, Oakland | Warm, trustworthy AI memory that feels personal and curated | Cold transactional tech; no control over what AI "remembers" |
| **Secondary — Developer** | AI/ML engineer integrating memory into agents | 5-tool API (`memory_add`, `memory_search`, `memory_get`, `memory_list`, `memory_delete`), MCP-compatible, Docker deployable | mem0 vendor lock-in, no audit trail, no governance |
| **Tertiary — Enterprise Admin** | Ops / compliance owner at a company | SOC2-grade HITL governance, audit log export, reviewed enterprise identity/RBAC | Can't prove what AI "knows"; no approval workflow |

---

## Value Proposition

**For People (consumer):**
- "Your AI's notebook" — personal, curated, intimate
- Know exactly what your AI has learned and when
- Forget anything, recover within 30 days
- Warm design that feels human, not like a database

**For Developers:**
- Drop-in mem0 replacement with `docker compose up`
- MCP-native: works with Claude Code, OpenClaw, any MCP-compatible agent
- Dual-database reliability: PostgreSQL (episodic) + Neo4j (semantic)
- Full audit trail by default — no extra code

**For Business:**
- Self-hosted sovereign memory (no vendor data lock-in)
- Governed, auditable, reversible — SOC2-ready
- Warm brand differentiation vs cold transactional competitors
- Developer open-source → enterprise SOC2 upsell path

---

## Business Model

```
Revenue Model:     Freemium OSS → Enterprise SaaS
Pricing Strategy:  Self-hosted free (OSS) / Vercel-deployed curator dashboard (SaaS)
Tiers:
  - Developer:    Docker Compose, auto-promotion mode, open-source
  - Enterprise:   SOC2 mode, HITL governance, reviewed enterprise SSO, Sentry alerts, CSV audit export
Market Position:   Governed, sovereign alternative to mem0.ai — warm design, self-hosted
```

---

## Success Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| API parity | All 5 mem0 tools implemented | 5/5 |
| Audit coverage | % of memory ops with Postgres trace | 100% |
| HITL gate | No autonomous Neo4j write without approval (SOC2 mode) | 0 bypasses |
| Consumer usability | Maya can find/forget a memory in <2 min | Pass Sarah's Law |
| Deploy simplicity | Single `docker compose up` for core infra | ≤1 command |

---

## Roadmap Context

**Current Focus (Epic 1):** Persistent Knowledge Capture  
→ Story 1.1 ✅ RuVix Security Hardening (28/28 tests)  
→ Issue #25 ✅ Real-Data Dashboard (completed 2026-04-26)  
→ Story 1.2 🔄 TraceMiddleware Integration (IN PROGRESS)

**Active Design Work:**
- PRD sent to Team Durham (2026-04-26): Graph View + Design System delivery
- Waiting on: Penpot token file, component library (10 components), 5 screen specs, graph node color spec
- Graph View library decided: react-force-graph-2d (MIT, feeds from `/api/memory/graph`)

**Next Milestone:** Graph View live at `/dashboard/graph` — interactive Neo4j knowledge graph with Allura brand styling

**Long-term Vision:** Personal AI Operating System — allura as the memory layer for any MCP-compatible agent, with warm consumer UI and enterprise HITL governance.

---

## Business Constraints

- **Bun only** — npm/npx banned (zero-trust supply chain policy)
- **`group_id` on every DB operation** — enforced by PostgreSQL CHECK constraint, not policy
- **Append-only traces** — no UPDATE/DELETE on events table, ever
- **HITL required in SOC2 mode** — no autonomous Neo4j promotion
- **`allura-*` tenant namespace** — `roninclaw-*` group_ids deprecated

---

## Related Files

- `technical-domain.md` — how business needs translate to technical architecture
- `business-tech-bridge.md` — explicit mapping of business → tech decisions
- `decisions-log.md` — key decisions with rationale
- `docs/allura/BLUEPRINT.md` — canonical business + functional requirements
- `docs/branding/deliverables/01_strategist_strategy-pack.md` — full STP brand strategy
