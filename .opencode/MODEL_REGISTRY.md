# Agent Model Registry

## Allura Agent-OS — cross-runtime model mapping

Update this file whenever a model is changed in either runtime

This is the authoritative contract between OpenCode and Claude Code agent equivalents

version: "5.0.0"
last_updated: "2026-05-05"

## Routing Philosophy

This registry uses **role-first routing with per-agent fallback chains**:

1. **Role-based base routing** — each agent gets a primary model matched to its role's reasoning needs
2. **Per-agent fallback** — each agent has a specific fallback model, not a universal default
3. **Task-based specialist overrides** — code-producing tasks escalate to the coding specialist (qwen3-coder-next)
4. **No universal fallback** — fallback chains are agent-specific to preserve role-appropriate degradation

The model stack: openai/gpt-5.5 (orchestration) → ollama-cloud/deepseek-v4-pro (strategy/vision) → ollama-cloud/kimi-k2.6 (multimodal/vision) → ollama-cloud/qwen3-coder-next (code) → ollama-cloud/glm-5.1 (steady) → openai/gpt-5.4-mini (interface/perf) → ollama-cloud/nemotron-3-super (recon).

## Primary Assignments

| Agent        | Role           | Primary Model                      | Specialist Override               | Fallback Model                  | Vision         |
| ------------ | -------------- | ---------------------------------- | --------------------------------- | ------------------------------- | -------------- |
| brooks       | Orchestrator   | openai/gpt-5.5                     | —                                 | ollama-cloud/deepseek-v4-pro           | Both ✅        |
| hightower    | Infra          | openai/gpt-5.5                     | —                                 | ollama-cloud/deepseek-v4-pro           | Both ✅        |
| jobs         | Strategy       | ollama-cloud/deepseek-v4-pro              | —                                 | ollama-cloud/kimi-k2.6                 | Both ✅        |
| woz          | Code           | openai/gpt-5.4-mini                | ollama-cloud/qwen3-coder-next     | ollama-cloud/qwen3-coder-next   | —              |
| carmack      | Code/Perf      | openai/gpt-5.4-mini                | —                                 | —                               | —              |
| bellard      | Code/Diag      | openai/gpt-5.4-mini                | —                                 | —                               | —              |
| fowler       | Code/Refactor  | openai/gpt-5.5                     | —                                 | —                               | —              |
| knuth        | Code/Data      | ollama-cloud/qwen3-coder-next      | —                                 | —                               | —              |
| pike         | Code/Interface | openai/gpt-5.4-mini                | —                                 | —                               | —              |
| scout        | Search/Triage  | openai/gpt-5.4-mini                | —                                 | ollama-cloud/nemotron-3-super   | —              |

## Routing Logic

```yaml
routing:
  # Tier 1 — Orchestration (highest judgment + vision fallback)
  - if: agent in [BROOKS_ARCHITECT, HIGHTOWER_DEVOPS]
    use: openai/gpt-5.5
    fallback: ollama-cloud/deepseek-v4-pro

  # Tier 1b — Strategy (long-context multimodal + vision)
  - if: agent == JOBS_INTENT_GATE
    use: ollama-cloud/deepseek-v4-pro
    fallback: ollama-cloud/kimi-k2.6

  # Tier 1c — Code/Refactor (frontier model)
  - if: agent == FOWLER_REFACTOR_GATE
    use: openai/gpt-5.5

  # Tier 2 — Code specialists (coding-native model)
  - if: agent == KNUTH_DATA_ARCHITECT
    use: ollama-cloud/qwen3-coder-next

  # Tier 2b — Woz temporary fallback route while qwen3-coder-next is unavailable
  - if: agent == WOZ_BUILDER
    use: openai/gpt-5.4-mini
    restore_primary_when_healthy: ollama-cloud/qwen3-coder-next

  # Tier 3 — Steady workhorses (mini model, always-on)
  - if: agent in [BELLARD_DIAGNOSTICS_PERF, CARMACK_PERFORMANCE, PIKE_INTERFACE_REVIEW]
    use: openai/gpt-5.4-mini

  # Scout — wide-context recon
  - if: agent == SCOUT_RECON
    use: openai/gpt-5.4-mini
    fallback: ollama-cloud/nemotron-3-super
```

## Global Default (opencode.json)

```json
{
  "model": "ollama-cloud/glm-5.1"
}
```

> All agents without an explicit `model:` field inherit this. Fallback activates on credit exhaustion or API error.

## Agent Frontmatter (per .md file)

```yaml
# brooks.md / hightower.md / fowler.md
model: openai/gpt-5.5
fallback_model: ollama-cloud/deepseek-v4-pro   # brooks + hightower only

# jobs.md
model: ollama-cloud/deepseek-v4-pro
fallback_model: ollama-cloud/kimi-k2.6

# scout.md
model: openai/gpt-5.4-mini
fallback_model: ollama-cloud/nemotron-3-super

# woz.md — temporary fallback route while qwen3-coder-next is unavailable
model: openai/gpt-5.4-mini
fallback_model: ollama-cloud/qwen3-coder-next

# knuth.md
model: ollama-cloud/qwen3-coder-next

# bellard.md / carmack.md / pike.md
model: openai/gpt-5.4-mini
```

## Model Rationale

| Model                         | Why                                                                 |
| ----------------------------- | ------------------------------------------------------------------- |
| openai/gpt-5.5                | Highest judgment for orchestration, scope, and infra reasoning      |
| ollama-cloud/deepseek-v4-pro         | Long-context strategy, multimodal product reasoning, HIGH priority  |
| ollama-cloud/kimi-k2.6               | Multimodal vision-capable, HIGH priority                            |
| openai/gpt-5.4-mini           | Mini frontier model — sufficient for interface review and data tasks |
| ollama-cloud/qwen3-coder-next | Coding specialist for patch, codegen, and perf-fix tasks            |
| ollama-cloud/nemotron-3-super | Fast wide-context scanning for recon and discovery (see note)       |
| ollama-cloud/glm-5.1          | Steady workhorse — instruction-following, always-on, cost-efficient |

## Benchmark Note

Performance claims for Nemotron-3-Super (e.g., "fastest overall at 1.63s") are **internal benchmark data** from this harness environment, not a generally established property of the model. Validate with your own per-agent evals before locking Nemotron as SCOUT primary.

## Excluded Models

| Model                      | Reason                                                     |
|----------------------------|------------------------------------------------------------|
| ollama-cloud/kimi-k2.5     | Superseded by ollama-cloud/kimi-k2.6 (vision + HIGH priority)     |
| openai/gpt-5.4             | Superseded by openai/gpt-5.5                               |
| ollama-cloud/gpt-5.4-nano  | Removed — no longer available                              |
| deepseek-v3.1:671b-cloud   | Replaced by ollama-cloud/deepseek-v4-pro                          |
| gpt-oss:120b-cloud         | Removed per owner decision                                 |
| gemma3:27b-cloud           | Removed per owner decision                                 |

## Validation Checklist

Before freezing this routing, run per-agent evals with 10–20 tasks and record:

- Success rate per route candidate
- Latency (p50, p95)
- Token cost
- Retry count

Most likely changes after real evals:

- **SCOUT_RECON** uses openai/gpt-5.4-mini as primary with Nemotron-3-Super as fallback; re-evaluate only if recon quality or availability changes
- **PIKE/FOWLER** may occasionally need frontier escalation on tricky architectural reviews
