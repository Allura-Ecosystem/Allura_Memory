# Optional Scout and measured owner-led hydration

Approved 2026-10-16. Scout remains installed; routine hydration does not launch it.
All Team RAM and Durham GOAT roles remain available. This change preserves the
complete selected persona, its reasoning/voice, and governed Allura Brain.

## Default and opt-in routes

```bash
./scripts/start-opencode.sh --hydrate --topic "<task> decisions blockers outcomes"
./scripts/start-opencode.sh --hydrate --with-scout --topic "<task> decisions blockers outcomes"
```

Default: one real Brooks session verifies scoped Brain recall and returns its
receipt. Optional: real Scout recall followed by tool-free Brooks synthesis.
Scout is useful for broad unfamiliar-repository discovery, independent recon,
or an explicit request. Local evidence is mandatory; Scout execution is not.
Tavily is only for necessary current external research, never a replacement
for local code or Brain decisions. No unrelated web search runs at startup.

The launcher reads only navigation, runtime task-pointer declaration and Git
state before model execution. It forwards a bounded, explicitly untrusted packet:
navigation headings/path references (3,000 characters), canonical pointer path/ID,
HEAD, and status (40 lines/2,000 characters with truncation metadata). Full runtime
configuration, unrelated fields, credentials and file bodies are not forwarded.
Reads are attributed to the launcher, not invented model tool calls. The pointer's
target is not read; story/status work must load its actual current task evidence.

## Live measurements

These are actual OpenCode session/token receipts, not estimates. Configured model:
Brooks `openai/gpt-6.1-sol`; optional Scout retains `openai/gpt-6-luna`.

| Run | Seconds | Aggregate tokens | Inferences | Scout sessions |
|---|---:|---:|---:|---:|
| Original approved baseline | 58.93 | 535,107 | 8 | 1 |
| Owner-led A | 28.09 | 33,216 | 2 | 0 |
| Owner-led B, accounting fixes | 28.95 | 32,742 | 2 | 0 |

Both owner-led runs completed with exactly one successful authenticated Brain
search in `allura-system`, limit 5, no writes, no extra tools, useful Brooks output,
valid local evidence and complete usage accounting. B reduces aggregate tokens by
93.88% against the original baseline. Totals include cached tokens and reasoning;
they are not unique context size or a monetary-cost estimate. Times include local
collection, model execution and receipt validation. This is not a latency SLA.

Private raw/sanitized evidence lives outside Git:
`/tmp/allura-hydration-optional-20261016-a/` and
`/tmp/allura-hydration-optional-20261016-b/`.
Do not commit raw receipts, local tenant declarations, or authentication data.

## Contracts and verification

- `.opencode/STARTUP.md` and `.agents/TEAM-RAM-RUNTIME.md` define routing.
- `scripts/hydrate-opencode.ts` enforces exact scope/query/limit, coherent Brain
  results, useful final synthesis, private evidence and a 90-second hard deadline.
- Complete live events supply token receipts; export fallback is allowed only
  with complete, coherent, finite usage for every finished assistant inference.
- The session-only profile hides skill catalogs and unrelated MCP schemas;
  selected full persona plus the two required skill contracts are preloaded.
- Ordinary work models, authentication, endpoint, tenant and role availability
  remain unchanged. Native hydration tools are disabled; only Brain search is allowed.
- Agent sync generates the complete canonical roles into OpenCode/Claude/Codex
  adapters. Native TOML fields follow the [official schema](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- Context7 through MCP Docker was attempted twice and returned retrieval failure;
  current [OpenCode agent](https://opencode.ai/docs/agents/) and
  [MCP documentation](https://opencode.ai/docs/mcp-servers/) were used as fallback.

```bash
bun test tests/scripts/hydrate-opencode.test.ts tests/scripts/optional-scout-policy.test.ts
bash .opencode/scripts/validate-oac-core.sh
bun tooling/agent-sync/sync-agents.mjs --check
```

The focused suite verifies both routes, complete persona parity, safe identity,
bounded evidence, wrong-tenant/malformed/failed Brain rejection, duplicate-token
deduplication and incomplete-export accounting failure. Full application typecheck
is not claimed: application dependencies are not installed in this isolated checkout.
No application code or semantic-memory promotion changed.
