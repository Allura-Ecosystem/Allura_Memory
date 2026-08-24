# FaithMeats → OpenWebUI Migration Plan
_"Move off Claude Desktop, holding nanoclaw (Fatima)."_
Ground-truthed on desktop 2026-07-05 against cloned source + live Brain.

## Verified facts (not memory)
- **Brain is HEALTHY on this desktop** — `:5888/ready` = postgres+neo4j+mcp all green.
- **mcpo IS LIVE on this desktop** — `:8000/openapi.json` serves `allura-memory-canonical`.
  (Corrects my earlier "mcpo is dead" claim — it is up and serving REST tools.)
- **faithwebui = stock open-webui.** Model backend via `OPENAI_API_BASE_URL` / `OLLAMA_BASE_URL`.
- **faithclaw = nanoclaw v2, customized.** Real `modules/faith-meats-gate` (approval gate),
  `container/skills/allura-memory-skill` baked in. Channels: telegram, cli, chat-sdk.
- **nanoclaw has NO OpenAI-compatible endpoint and NO openwebui channel.**
  => OpenWebUI CANNOT point at nanoclaw as a model. They are two front-ends into one Brain.
- nanoclaw channels use a `channel-registry.ts` + `adapter.ts` abstraction => a new
  OpenWebUI channel adapter is feasible (Stage 2).
- Fatima + live stack run on the LAPTOP, not verifiable from desktop. Taken on Captain's word.

## Three integration seams
1. **Memory seam (works TODAY):** OpenWebUI → mcpo `:8000` → Brain. Register mcpo as a
   Tool Server in OpenWebUI. Gives the 11 `memory_*` tools in the web UI.
2. **Model seam (one decision):** OpenWebUI needs an OpenAI-shaped model backend.
   - (a) Ollama Cloud — key already at `~/.config/nanoclaw/ollama-cloud.env`. Simplest.
   - (b) Direct Anthropic via LiteLLM shim — closest to Claude Desktop parity.
3. **Agent seam = "holding nanoclaw" (Stage 2, net-new code):** write an OpenWebUI channel
   adapter (sibling of `telegram.ts`) so the web UI is a channel into Fatima's container —
   inheriting `faith-meats-gate` + `allura-memory-skill`. Doesn't exist yet.

## Staged plan (never leaves you stuck)
### Stage 1 — Get off Claude Desktop this week (low risk)
- S1.1 Decide LAN vs Cloudflare tunnel for laptop→desktop mcpo (`:8000`). LAN simplest.
- S1.2 On laptop: bring up faithwebui via stock `docker-compose.yaml`; set model backend (2a/2b).
- S1.3 Register mcpo tool server in OpenWebUI (Admin→Tools) w/ coworker Bearer token
  (tenant `allura-faithmeats`).
- S1.4 Move Gilliam SOUL/IDENTITY into an OpenWebUI Model preset (system prompt).
- S1.5 VERIFY critical path: web chat → `memory_search` returns a real Brain row.
- S1.6 Keep Claude Desktop running in parallel until S1.5 passes; cut it last.

### Stage 2 — Actually "hold nanoclaw" (the real target)
- S2.1 Build OpenWebUI channel adapter in nanoclaw (model on `telegram.ts` + channel-registry).
- S2.2 Route web chat through Fatima's container => `faith-meats-gate` approval cards fire
  from the web UI, container skills inherited.
- S2.3 Optionally retire the standalone model backend from S1.

## Open decisions (need Captain)
- ~~D1: Model backend — Ollama Cloud (2a) or Anthropic/LiteLLM (2b)?~~ **RESOLVED: Ollama local — Troy, Omar, and Jeeves on the laptop. S1.2 model backend = Ollama local.**
- D2: ~~mcpo exposure — LAN or Cloudflare tunnel?~~ **RESOLVED: Cloudflare tunnel at `https://mcp.faithmeats.org`**
- D3: Target depth — Stage 1 only (replace Desktop), or Stage 1→2 (truly hold nanoclaw)?

## Stale memory to fix
- MEMORY.md `edge-wiring` (2026-06-28: "laptop canonical cloud, Brain on edge") is
  contradicted by healthy Brain on THIS desktop. Correct on Captain's say-so.
