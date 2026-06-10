# ADR: Allura Agent Factory — BMad Builder as Authoring Layer

**Status:** Accepted  
**Date:** 2026-06-10  
**Author:** Brooks (brooks-architect)  
**Version:** 0.1  
**Supersedes:** None (new decision)  
**Brain trace:** `1c4c826c-5268-434e-bf41-022987868b1b`

---

## Context

The Allura ecosystem needs a repeatable way to author, package, validate, and distribute agent teams for client tenants (Faith Meats, Difference Driven, and future). Hand-building each client's agent set, skills, and governance overlay is unscalable.

We evaluated BMad Builder (bmad-code-org, Agent Skills standard) as the authoring layer. BMad handles the accidental complexity of agent creation (authoring, packaging, distribution, marketplace) while Allura preserves the essential complexity (governance, memory, invariants, audit trails).

## Decision

**BMad Builder is adopted as the Allura Agent Factory's authoring/packaging layer.**

Allura does NOT fork BMad. It ships a governance overlay through BMad's supported three-layer TOML customization surface:

### Overlay Structure (v0.1)

```toml
# activation_steps_prepend — inject Allura governance BEFORE agent greeting
[activation_steps_prepend]
step_0_brain_hydration = "Scout hydration via allura-brain_memory_search(group_id='allura-${CLIENT}')"

# persistent_facts — tenant invariants injected into every agent's context
[persistent_facts]
group_id_enforcement = "Every operation MUST include group_id matching allura-${CLIENT}"
append_only = "PostgreSQL events are append-only — no UPDATE/DELETE"
supersedes_versioning = "Neo4j nodes versioned via SUPERSEDES — never mutated in-place"
hitl_required = "Promotion to semantic layer requires human curator approval"
brain_contract = "All memory operations use canonical MCP interface"

# activation_steps_append — inject Allura governance after agent loads
[activation_steps_append]
session_start_log = "allura-brain_memory_add(session_start) at startup"
on_complete_writeback = "TASK_COMPLETE event logged to Brain on session end"
```

### Overlay Principles

1. **Sparse** — Only Allura-specific governance is overlayed. BMad defaults are preserved.
2. **Update-safe** — Overlay references stable Allura interfaces; BMad upgrades don't break governance.
3. **Defense-in-depth** — Overlay is prompt-level reinforcement; true enforcement is in the Brain API (CHECK constraints, API middleware, HITL gate).
4. **Single source** — One canonical governance source → generated into each overlay. No copy-paste.

### Factory Pipeline

```
intake (client needs) 
  → bmad build (author agents/skills/workflows)
  → overlay (inject governance TOML)
  → validate (Agent Skills compliance + Allura gate check)
  → deliver (package as installable plugin/skill module)
  → operate (per-tenant, governed by Brain)
```

### Repository Structure

```
monorepo/factory/
├── templates/          # Governance overlay templates
├── generators/         # Overlay generation tooling
├── validators/         # Allura-specific validation gates
├── examples/           # Faith Meats, Difference Driven reference overlays
└── ADR.md              # This document
```

## Consequences

### Positive
- Buy accidental complexity (authoring, packaging, distribution) from BMad; own essential complexity (governance + memory)
- Governance becomes a generated build artifact, not hand-copied prose — eliminates drift
- BMad's marketplace provides distribution channel for agent teams
- Overlay approach is composable — new invariants added without touching client agents

### Negative
- BMad Builder is an external dependency — interface must be monitored for breaking changes
- Overlay generation is a custom build pipeline to maintain
- Two governance surfaces (prompt overlay vs API enforcement) risk divergence without automated sync

### Risks / Mitigations
| Risk | Mitigation |
|------|------------|
| BMad interface changes break overlay | Pin to specific BMad version; CI validates overlay compatibility on BMad upgrades |
| Prompt-level governance diverges from API enforcement | Contract-sync check in CI: overlay TOML must match live policies from `governance_list_policies` |
| Overlay generator becomes second-system effect | Ship v0.1 as a single script; no framework, no plugin, no abstraction layer until proven |

## Open Questions

1. **Overlay generator: plugin vs skill?** Plugin ships with BMad Builder; skill ships within Allura workspace. Decision deferred until v0.1 generator is built and tested.
2. **Marketplace strategy:** Does Allura ship agent teams to BMad marketplace or run its own? Separate ADR.
3. **Tenant provisioning automation:** How to automate per-client Brain tenant creation? Separate ADR.

## Related

- Brain session-end receipt: `04d28b9b-7c79-4945-8344-d0b21c1b105f`
- Allura invariants: `pol-001` through `pol-006`
- BMad Builder: bmad-code-org, Agent Skills standard
- Team RAM canon: `Allura-TeamRam/.claude/agent/core/brooks.md`

---

*AI-Assisted Documentation: This ADR was drafted by Brooks (AI agent) and reconstructed from Brain trace on 2026-06-10 after the original file was lost. The architecture decision itself was made in-session on 2026-06-10 and traces exist in both episodic and semantic stores.*
