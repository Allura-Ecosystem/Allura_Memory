# Agent Model Registry

## Allura Agent-OS — cross-runtime model mapping

Update this file whenever a model is changed in either runtime

This is the authoritative contract between OpenCode and Claude Code agent equivalents

version: "4.0.0"
last_updated: "2026-04-19"

## Routing Philosophy

This registry uses **role-first routing with per-agent fallback chains**:

1. **Role-based base routing** — each agent gets a primary model matched to its role's reasoning needs
2. **Per-agent fallback** — each agent has a specific fallback model, not a universal default
3. **Task-based specialist overrides** — code-producing tasks escalate to the coding specialist (qwen3-coder-next)
4. **No universal fallback** — fallback chains are agent-specific to preserve role-appropriate degradation

The four-tier model stack: openai/gpt-5.4 (orchestration) → ollama-cloud/qwen3-coder-next (code) → ollama-cloud/glm-5.1 (steady) → openai/gpt-5.4-mini (interface).

## Primary Assignments

| Agent        | Role           | Primary Model                      | Specialist Override               | Fallback Model                  |
| ------------ | -------------- | ---------------------------------- | --------------------------------- | ------------------------------- |
| brooks       | Orchestrator   | openai/gpt-5.4                     | —                                 | ollama-cloud/kimi-k2.5          |
| hightower    | Infra          | openai/gpt-5.4                     | —                                 | ollama-cloud/kimi-k2.5          |
| jobs         | Strategy       | ollama-cloud/kimi-k2.5             | —                                 | openai/gpt-5.4                  |
| scout        | Search/Triage  | openai/gpt-5.4-mini                | —                                 | ollama-cloud/nemotron-3-super   |
| woz          | Code           | ollama-cloud/qwen3-coder-next      | —                                 | ollama-cloud/kimi-k2.5          |
| carmack      | Code/Perf      | ollama-cloud/qwen3-coder-next      | —                                 | ollama-cloud/kimi-k2.5          |
| bellard      | Code/Diag      | ollama-cloud/glm-5.1               | qwen3-coder-next for perf code    | ollama-cloud/qwen3-coder-next   |
| fowler       | Code/Refactor  | ollama-cloud/glm-5.1               | —                                 | ollama-cloud/qwen3-coder-next   |
| knuth        | Code/Data      | ollama-cloud/glm-5.1               | —                                 | openai/gpt-5.4-mini              |
| pike         | Code/Interface | openai/gpt-5.4-mini                | —                                 | ollama-cloud/kimi-k2.5          |

## Routing Logic

```yaml
routing:
  # Tier 1 — Orchestration (highest judgment)
  - if: agent in [BROOKS_ARCHITECT, HIGHTOWER_DEVOPS]
    use: openai/gpt-5.4
    fallback: ollama-cloud/kimi-k2.5

  # Tier 1b — Strategy (long-context multimodal reasoning)
  - if: agent == JOBS_INTENT_GATE
    use: ollama-cloud/kimi-k2.5
    fallback: openai/gpt-5.4

  # Tier 2 — Code specialists (coding-native model)
  - if: agent in [WOZ_BUILDER, CARMACK_PERFORMANCE]
    use: ollama-cloud/qwen3-coder-next
    fallback: ollama-cloud/kimi-k2.5

  # Tier 3 — Steady workhorses (instruction-following, always-on)
  - if: agent in [BELLARD_DIAGNOSTICS_PERF, FOWLER_REFACTOR_GATE]
    use: ollama-cloud/glm-5.1
    fallback: ollama-cloud/qwen3-coder-next

  - if: agent == KNUTH_DATA_ARCHITECT
    use: ollama-cloud/glm-5.1
    fallback: openai/gpt-5.4-mini

  # Tier 4 — Interface review (mini model, sufficient for surface-area checks)
  - if: agent == PIKE_INTERFACE_REVIEW
    use: openai/gpt-5.4-mini
    fallback: ollama-cloud/kimi-k2.5

  # Scout — wide-context recon
  - if: agent == SCOUT_RECON
    use: openai/gpt-5.4-mini
    fallback: ollama-cloud/nemotron-3-super

  # Specialist overrides (task-based escalation)
  - if: agent == BELLARD_DIAGNOSTICS_PERF and task in [perf_patch, hotpath_fix, benchmark_refactor]
    use: ollama-cloud/qwen3-coder-next
    fallback: ollama-cloud/glm-5.1
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
# brooks.md / hightower.md
model: openai/gpt-5.4

# jobs.md
model: ollama-cloud/kimi-k2.5

# scout.md
model: openai/gpt-5.4-mini
fallback_model: ollama-cloud/nemotron-3-super

# woz.md / carmack.md
model: ollama-cloud/qwen3-coder-next

# bellard.md / fowler.md / knuth.md
model: ollama-cloud/glm-5.1

# pike.md
model: openai/gpt-5.4-mini
```

## Model Rationale

| Model                         | Why                                                                 |
| ----------------------------- | ------------------------------------------------------------------- |
| openai/gpt-5.4                | Highest judgment for orchestration, scope, and infra reasoning      |
| openai/gpt-5.4-mini           | Mini frontier model — sufficient for interface review and data tasks |
| ollama-cloud/kimi-k2.5        | Long-context strategy and multimodal product reasoning              |
| ollama-cloud/qwen3-coder-next | Coding specialist for patch, codegen, and perf-fix tasks            |
| ollama-cloud/nemotron-3-super | Fast wide-context scanning for recon and discovery (see note)       |
| ollama-cloud/glm-5.1          | Steady workhorse — instruction-following, always-on, cost-efficient |
| ollama-cloud/gpt-5.4-nano    | Fastest/cheapest for tiny scout lookups and prefilter checks        |

## Benchmark Note

Performance claims for Nemotron-3-Super (e.g., "fastest overall at 1.63s") are **internal benchmark data** from this harness environment, not a generally established property of the model. Validate with your own per-agent evals before locking Nemotron as SCOUT primary.

## Excluded Models

| Model                      | Reason                                                     |
|----------------------------|------------------------------------------------------------|
| gpt-oss:120b-cloud         | Removed per owner decision                                 |
| gemma3:27b-cloud           | Removed per owner decision                                 |
| deepseek-v3.1:671b-cloud   | Removed per owner decision                                 |

## Validation Checklist

Before freezing this routing, run per-agent evals with 10–20 tasks and record:

- Success rate per route candidate
- Latency (p50, p95)
- Token cost
- Retry count

Most likely changes after real evals:

- **SCOUT_RECON** uses openai/gpt-5.4-mini as primary with Nemotron-3-Super as fallback; re-evaluate only if recon quality or availability changes
- **PIKE/FOWLER** may occasionally need frontier escalation on tricky architectural reviews
