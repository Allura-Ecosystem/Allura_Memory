# Agent Model Registry

## Allura Agent-OS — cross-runtime model mapping

Update this file whenever a model is changed in either runtime.

This is the authoritative **human-readable contract** between the OpenCode, Claude Code, and Codex agent equivalents. The **machine authority** is `tooling/agent-sync/models.map.json` — `sync-agents.mjs` writes agent frontmatter from it. If this document and the map disagree, the map wins; fix this document.

version: "3.1.0"
last_updated: "2026-07-04"

> **ADR 2026-07-04:** The opencode runtime uses **Ollama Cloud models only** — no `openai/*` entries. Prior registry entries such as `ollama-cloud/gpt-5.4` (and the whole `ollama-cloud/*` namespace) referenced models that do not exist in the Ollama Cloud catalog and are removed. All tags below were verified against <https://ollama.com/search?c=cloud> on 2026-07-04.

## Routing Philosophy

Three tiers, role-first. Every agent belongs to exactly one tier; per-runtime models are set per tier:

| Tier | Purpose | opencode | claude | codex |
| ---- | ------- | -------- | ------ | ----- |
| `ultrabrain` | Orchestration, architecture, scope — hard judgment | `ollama/glm-5.2:cloud` | `opus` | `gpt-5.4` |
| `standard` | Building, refactoring, diagnostics — steady coding work | `ollama/qwen3-coder-next:cloud` | `sonnet` | `gpt-5.4-mini` |
| `cheap` | Recon, curation, auditing — high-volume, low-stakes | `ollama/nemotron-3-super:cloud` | `haiku` | `gpt-5.4-mini` |

## Primary Assignments

| Agent | Role | Tier | opencode model |
| ----- | ---- | ---- | -------------- |
| brooks | Chief Architect / orchestrator | ultrabrain | ollama/glm-5.2:cloud |
| jobs | Intent Gate / scope owner | ultrabrain | ollama/glm-5.2:cloud |
| woz | Primary Builder | standard | ollama/qwen3-coder-next:cloud |
| pike | Interface & simplicity gate | standard | ollama/qwen3-coder-next:cloud |
| bellard | Performance & diagnostics | standard | ollama/qwen3-coder-next:cloud |
| fowler | Maintainability gate / refactor | standard | ollama/qwen3-coder-next:cloud |
| carmack | Performance & optimization | standard | ollama/qwen3-coder-next:cloud |
| hightower | DevOps / infrastructure | standard | ollama/qwen3-coder-next:cloud |
| knuth | Data architect / schema | standard | ollama/qwen3-coder-next:cloud |
| scout | Recon / discovery | cheap | ollama/nemotron-3-super:cloud |
| bahari | Allura Memory Curator | cheap | ollama/nemotron-3-super:cloud |
| reality-checker-tram | Tier-2 Harness Auditor | cheap | ollama/nemotron-3-super:cloud |

## Fallback Policy

Single global fallback, deliberately distinct from every primary:

```json
{ "model": "ollama/glm-5.1:cloud" }
```

Set in `opencode.json`. Activates on credit exhaustion or API error. No per-agent fallback chains — multi-hop fallback (A→B→C) introduces cascade failures (ADR 2026-04-19 still stands).

## Model Rationale

| Model | Why |
| ----- | --- |
| ollama/glm-5.2:cloud | Z.ai flagship for long-horizon tasks; ~1M-token context; project-level engineering and orchestration judgment |
| ollama/qwen3-coder-next:cloud | Agentic coding specialist; 80B MoE (3B active per token) so it is cheap at volume; 256K context; tool-calling trained |
| ollama/nemotron-3-super:cloud | 120B open MoE built for multi-agent applications; fast wide-context scanning for recon and curation |
| ollama/glm-5.1:cloud | Universal fallback — previous-generation flagship, instruction-following, always-on, distinct from all primaries |

## Benchmark Note

Performance claims for Nemotron-3-Super (e.g., "fastest overall at 1.63s") are **internal benchmark data** from this harness environment, not a generally established property of the model. Validate with your own per-agent evals before locking Nemotron as the cheap-tier primary.

## Excluded Models

| Model | Reason |
| ----- | ------ |
| openai/* (any, in opencode) | ADR 2026-07-04 — opencode runtime is Ollama Cloud only |
| ollama-cloud/gpt-5.4, gpt-5.4-mini, gpt-5.4-nano | Do not exist in the Ollama Cloud catalog (registry ghosts, removed) |
| gpt-oss:120b-cloud | Removed per owner decision |
| gemma3:27b-cloud | Removed per owner decision |
| deepseek-v3.1:671b-cloud | Removed per owner decision |
| deepseek-v4-pro, kimi-k2.6, minimax-m3 | Valid catalog models, but dropped from primaries to keep the three-tier system flat; revisit via evals if a tier underperforms |

## Validation Checklist

Before freezing this routing, run per-agent evals with 10–20 tasks and record:

- Success rate per route candidate
- Latency (p50, p95)
- Token cost
- Retry count

Most likely changes after real evals:

- **scout** may swap away from Nemotron if discovery accuracy is weaker than speed suggests
- **standard tier** may promote `kimi-k2.7-code` or `deepseek-v4-pro` if qwen3-coder-next underperforms on multi-file surgery
- **pike/fowler** may occasionally need ultrabrain escalation on tricky architectural reviews
