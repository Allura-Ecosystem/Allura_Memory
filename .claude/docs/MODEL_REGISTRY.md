# Agent Model Registry

## Allura Agent-OS — cross-runtime model mapping

Update this file whenever a model is changed in either runtime

This is the authoritative contract between OpenCode and Claude Code agent equivalents

version: "3.1.0"
last_updated: "2026-05-05"

> **Note:** This file mirrors `.opencode/MODEL_REGISTRY.md` (v5.0.0), the canonical registry. Agent `.md` frontmatter in `.opencode/agent/` is the source of truth.

## Primary Assignments

| Agent        | Role           | Primary Model                      | Specialist Override               | Fallback Model                  |
| ------------ | -------------- | ---------------------------------- | --------------------------------- | ------------------------------- |
| brooks       | Orchestrator   | openai/gpt-5.5                     | —                                 | ollama-cloud/deepseek-v4-pro           |
| hightower    | Infra          | openai/gpt-5.5                     | —                                 | ollama-cloud/deepseek-v4-pro           |
| jobs         | Strategy       | ollama-cloud/deepseek-v4-pro              | —                                 | ollama-cloud/kimi-k2.6                 |
| woz          | Code           | ollama-cloud/qwen3-coder-next      | —                                 | —                               |
| carmack      | Code/Perf      | openai/gpt-5.4-mini                | —                                 | —                               |
| bellard      | Code/Diag      | openai/gpt-5.4-mini                | —                                 | —                               |
| fowler       | Code/Refactor  | openai/gpt-5.5                     | —                                 | —                               |
| knuth        | Code/Data      | ollama-cloud/qwen3-coder-next      | —                                 | —                               |
| pike         | Code/Interface | openai/gpt-5.4-mini                | —                                 | —                               |
| scout        | Search/Triage  | openai/gpt-5.4-mini                | —                                 | ollama-cloud/nemotron-3-super   |

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

# woz.md / knuth.md
model: ollama-cloud/qwen3-coder-next

# bellard.md / carmack.md / pike.md
model: openai/gpt-5.4-mini
```

## Cross-Runtime Mapping

| Agent Name | OpenCode Model              | Claude Code Model           | Behavioral Notes                                           |
|------------|-----------------------------|-----------------------------|------------------------------------------------------------|
| Brooks     | openai/gpt-5.5              | claude-opus-4-6             | CA/VA commands; ADR discipline identical                   |
| Jobs       | ollama-cloud/deepseek-v4-pro       | claude-sonnet-4-6           | Intent gate + scope control; same acceptance criteria      |
| Woz        | ollama-cloud/qwen3-coder-next | claude-sonnet-4-6         | Builder; write templates identical; TDD enforced           |
| Pike       | openai/gpt-5.4-mini         | claude-sonnet-4-6           | Read-only architecture consultation; interface review      |
| Bellard    | openai/gpt-5.4-mini         | claude-sonnet-4-6           | Performance + diagnostics; measurement-first               |
| Carmack    | openai/gpt-5.4-mini         | claude-sonnet-4-6           | Optimization; latency profiling; API design                |
| Fowler     | openai/gpt-5.5              | claude-opus-4-6             | Refactor gate; incremental change; maintainability         |
| Knuth      | ollama-cloud/qwen3-coder-next | claude-sonnet-4-6         | Data architect; schema design; query optimization          |
| Hightower  | openai/gpt-5.5              | claude-opus-4-6             | CI/CD; IaC; one-command deploy                             |
| Scout      | openai/gpt-5.4-mini          | claude-sonnet-4-6          | Recon + discovery; Nemotron-3-Super fallback               |

## Behavioral Parity Contract

The following behaviors MUST be identical across both runtimes:

- group_id: `allura-system` on all writes — no exceptions
- HITL gate: no Postgres → Neo4j promotion without human approval
- Append-only: no UPDATE/DELETE on Postgres event rows
- Agent frontmatter is source of truth for model selection

## Model Rationale

| Model                         | Why                                                                 |
| ----------------------------- | ------------------------------------------------------------------- |
| openai/gpt-5.5                | Highest judgment for orchestration, scope, and infra reasoning      |
| ollama-cloud/deepseek-v4-pro         | Long-context strategy, multimodal product reasoning, HIGH priority  |
| ollama-cloud/kimi-k2.6               | Multimodal vision-capable, HIGH priority                            |
| openai/gpt-5.4-mini           | Mini frontier model — sufficient for interface review and data tasks |
| ollama-cloud/qwen3-coder-next | Coding specialist for patch, codegen, and perf-fix tasks            |
| ollama-cloud/nemotron-3-super | Fast wide-context scanning for recon and discovery                  |
| ollama-cloud/glm-5.1          | Steady workhorse — instruction-following, always-on, cost-efficient |

## Excluded Models

| Model                      | Reason                                                     |
|----------------------------|------------------------------------------------------------|
| ollama-cloud/kimi-k2.5     | Superseded by ollama-cloud/kimi-k2.6 (vision + HIGH priority)     |
| openai/gpt-5.4             | Superseded by openai/gpt-5.5                               |
| ollama-cloud/gpt-5.4-nano  | Removed — no longer available                              |
| deepseek-v3.1:671b-cloud   | Replaced by ollama-cloud/deepseek-v4-pro                          |
| gpt-oss:120b-cloud         | Removed per owner decision                                 |
| gemma3:27b-cloud           | Removed per owner decision                                 |
