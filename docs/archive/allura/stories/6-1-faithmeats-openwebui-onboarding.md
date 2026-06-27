> [!NOTE]
> **AI-Assisted Documentation**
> Drafted with AI assistance (Claude Code / Team RAM — Brooks). Working reference, not a final
> specification. Defer to source code, schemas, and team consensus where they conflict.

# Story 6.1: Onboard the FaithMeats team onto shared Allura memory via OpenWebUI

**Status:** in-progress — 2026-06-26
**Priority:** P1
**Source:** Notion Epic 6 (laptop relay / secure access to self-hosted Allura) · DESIGN-AUTH (F1–F5) · DESIGN-MCP-GATEWAY (F13–F15) · ADR-001
**Owner:** Brooks (Team RAM)

## Story

As an **operator (Sabir) onboarding the FaithMeats team**,
I want **my coworkers (Gabe, Samuel, and other faithmeats.com Google Workspace users) to log into the shared, self-hosted Allura memory through OpenWebUI on the LAN**,
so that **the whole team reads and writes the same governed organizational memory without anyone needing Claude Desktop (which has no Linux build).**

## Context & Topology (as-built)

- **Laptop `192.168.1.12`** (`ronin704-MS-7B86`): runs the Allura Brain stack in Docker — canonical MCP server `allura-memory-canonical v1.0.0` published on `:5888` (container `allura-memory-mcp`, internal `:3201`). Now also runs the **mcpo** OpenAPI bridge on `:8000`.
- **Other computer `192.168.1.18`**: runs **OpenWebUI** on `:8080` — the team's multi-user client (replaces Claude Desktop).
- Both hosts share subnet `192.168.1.0/24`.

The running canonical MCP is **param-based with no auth** — `group_id` / `user_id` are passed as plain tool arguments. Acceptable for a LAN proof; this is the security gap the hardened path (gateway + per-user tokens) closes.

## Tenancy (non-negotiable — ADR-001)

- Organization = the only tenant boundary = `group_id`, pattern `^allura-[a-z0-9-]+$`. FaithMeats → **`allura-faithmeats`**.
- Workspaces are a `workspace_id` sub-scope under the org `group_id`; they never mint new `group_id`s. [Source: docs/allura-hosted/DESIGN-AUTH.md#Business Rules / Constraints]
- Users (`gabec`, `samuel.m`, …) are `user_id`s within `allura-faithmeats`, never separate tenants.

## Acceptance Criteria

1. **AC1 — Bridge stands up:** mcpo runs on the laptop, binds `0.0.0.0:8000`, proxies the canonical MCP at loopback `http://127.0.0.1:5888/mcp` (`--server-type streamable_http`), exposes all `memory_*` tools as REST at `/openapi.json`. ✅ verified
2. **AC2 — Round-trip on the laptop:** `memory_add` then `memory_list` through `:8000` for `group_id=allura-faithmeats` returns the written memory. ✅ verified (write id `8f0050e0…`, read id `5f0f5498…`)
3. **AC3 — OpenWebUI registration:** OpenWebUI on `192.168.1.18` registers the tool server at `http://192.168.1.12:8000` (Bearer API key) and lists the 11 `memory_*` tools.
4. **AC4 — Cross-machine round-trip:** from an OpenWebUI chat, a tool call (`memory_list` with `group_id=allura-faithmeats`, `user_id=gabec`) returns the test memory.
5. **AC5 — Multi-user:** a second OpenWebUI account performs AC4 (distinct `user_id`, same `group_id`), proving shared-org / per-user attribution. *(Task 2)*
6. **AC6 — Hardened path (gateway):** the token-gated MCP gateway (`/mcp`) validates a bearer token per request and **server-injects** `group_id` (agent-supplied `group_id` ignored/rejected); per-user tokens minted scoped `memory:read,memory:write`. [Source: docs/allura-hosted/DESIGN-MCP-GATEWAY.md#Functional Requirements F13–F15] *(Task 4)*
7. **AC7 — Re-point:** OpenWebUI re-pointed at the gated endpoint with per-user tokens; AC4/AC5 still pass with auth enforced. *(Task 5)*
8. **AC8 — Persistence:** the bridge (and/or gateway) survives reboot as a managed service (systemd user unit), not a session-bound `nohup`. *(Task 4)*
9. **AC9 — Tracked:** work lands on branch `feat/faithmeats-onboarding`, this story committed, a PR opened and linked to Notion Epic 6, and an outcome trace written to Allura Brain.

## Tasks / Subtasks

- [x] Task 1 — mcpo bridge + laptop round-trip (AC: 1, 2)
  - [x] Confirm `uvx`/`python3`/`node` tooling on the laptop
  - [x] Launch mcpo against **loopback** `127.0.0.1:5888` (LAN-IP target was the root-cause failure; see Debug Log)
  - [x] Verify `memory_add` + `memory_list` through `:8000` for `allura-faithmeats`
  - [x] Write Task 1 outcome trace to Brain (`allura-system`)
- [ ] Task 1b — OpenWebUI registration + cross-machine round-trip (AC: 3, 4) — *needs operator UI action on `192.168.1.18`*
- [ ] Task 2 — Multi-user proof: second OpenWebUI account round-trips (AC: 5)
- [x] Task 3 — This story + branch (AC: 9, partial)
- [ ] Task 4 — Command Center gateway up; create `allura-faithmeats` org + admin; mint per-user tokens; make bridge/gateway a systemd service (AC: 6, 8)
- [ ] Task 5 — Re-point OpenWebUI at gated `/mcp` with per-user tokens (AC: 7)
- [ ] Task 6 — Open PR linked to Notion Epic 6; final outcome trace to Brain (AC: 9)

## Dev Notes

- **Bridge command (as-built):** `uvx mcpo --host 0.0.0.0 --port 8000 --api-key <key> --server-type streamable_http -- http://127.0.0.1:5888/mcp`. mcpo negotiates protocol `2025-11-25` and auto-generates one REST route per MCP tool.
- **HITL caveat for the team:** `memory_search` only returns HITL-promoted (semantic/graph) memories; freshly-written episodic memories appear immediately via `memory_list` / `memory_get` but NOT `memory_search` until curator promotion (threshold 0.85). Put this in team onboarding so coworkers don't think writes "failed." [Source: CLAUDE.md#Curator; src/curator/]
- **Hardened path already exists in code:** `POST /api/tokens` is admin-only (`requireRole(request,"admin")`), server-injects `group_id` from the caller's session, returns the raw token exactly once, default scopes `["memory:read","memory:write"]`. [Source: src/app/api/tokens/route.ts]
- **Membership:** linking a Workspace user to the org uses `POST /api/members` (admin-only) backed by the `memberships` table. [Source: src/app/api/members/route.ts; docker/postgres-init/29-memberships.sql]
- **Open decision:** one shared team token vs per-coworker tokens. Recommendation: **per-coworker** for attribution + revocation granularity (least privilege).

### Project Structure Notes

- Bridge is operational tooling, not app code — no changes under `src/` required for Tasks 1–2. Gateway path (Task 4–5) exercises existing `src/app/mcp/route.ts`, `src/app/api/tokens/route.ts`, `src/app/api/members/route.ts`.
- Story filed under `docs/archive/allura/stories/` per the canonical-surface rule (non-canonical deliverables do not go in `docs/allura/`). BMad working copy convention is `_bmad-output/` (gitignored), so the tracked copy lives here for PR review.

### References

- [Source: docs/allura-hosted/DESIGN-AUTH.md#Functional Requirements] — F1–F5 org/workspace/membership/role + `group_id` generation (ADR-001).
- [Source: docs/allura-hosted/DESIGN-MCP-GATEWAY.md#Functional Requirements] — F13–F15 bearer-token `/mcp`, per-request validation, server-injected `group_id`.
- [Source: src/app/api/tokens/route.ts] — admin-only token minting, server-side `group_id`, one-time raw token.
- [Source: src/app/api/members/route.ts; docker/postgres-init/29-memberships.sql] — membership linking.
- [Source: CLAUDE.md#Non-Negotiable Invariants] — `group_id` on every op, append-only PG, Neo4j SUPERSEDES, HITL promotion.
- Notion Epic 6 — laptop relay / secure access to self-hosted Allura (external tracker).

## Dev Agent Record

### Agent Model Used

Brooks (Team RAM) — Claude Code session.

### Debug Log References

- Root cause of mcpo startup failure: target was LAN IP `192.168.1.18:5888` (unreachable from host → `httpx.ConnectError`); the trailing `anyio.WouldBlock` / "exit cancel scope in a different task" was a shutdown artifact, not the primary fault. Fix: target loopback `127.0.0.1:5888`. Bridge then initialized cleanly.
- Topology correction: laptop is `192.168.1.12` (not `.18`); OpenWebUI is on a separate machine at `192.168.1.18`. OpenWebUI must target `http://192.168.1.12:8000`.

### Completion Notes List

- Task 1 complete & verified (AC1, AC2). Outcome trace `cbfeda61-5881-4112-b6e2-205e9bdceba9` (allura-system, score 0.85, pending HITL review).

### File List

- `docs/archive/allura/stories/6-1-faithmeats-openwebui-onboarding.md` (this file)

## Gateway hardening (per-coworker tokens)

**Decision:** A Caddy reverse proxy on `:8000` validates per-coworker Bearer tokens
before forwarding to mcpo (moved to loopback `127.0.0.1:8001`). This replaces
the previous single shared API key arrangement for LAN callers.

**Architecture:**

```
OpenWebUI (192.168.1.18)
    |
    | Bearer <coworker-token>
    v
Caddy gateway :8000   (allura-mcpo-gateway.service)
    |  - map Authorization → coworker_id
    |  - 401 if no valid token (Pike #3)
    |  - path allow-list /docs*, /openapi.json*, /memory_* (Pike #4)
    |  - strip Authorization; inject Bearer <MCPO_API_KEY> + X-Allura-Coworker-Id
    |  - log redacts Authorization header (Pike #5)
    v
mcpo bridge 127.0.0.1:8001   (allura-mcpo-bridge.service)
    v
Allura canonical MCP 127.0.0.1:5888
```

**Artifacts (all under `scripts/openwebui-bridge/`):**

- `allura-mcpo-gateway.Caddyfile.template` — Caddy config with COWORKER_TOKENS markers
- `allura-mcpo-gateway.service.template` — systemd --user unit (`Requires=allura-mcpo-bridge.service`)
- `install-token-gateway.sh` — installs the Caddy gateway; validate-before-reload (Pike #1)
- `mint-coworker-token.sh` — mint / revoke / rotate / list; flock-guarded (Pike #2), validate-before-reload (Pike #1), rotate subcommand (Pike #7)
- `coworker-tokens.example` — format documentation with Pike #8 note

**Explicit deferred limitation (ADR-001 / Pike #8):**
`user_id` in the tool payload (`memory_add`, `memory_list`, etc.) is **self-reported**
by the coworker; it is not cryptographically bound to the Bearer token at this stage.
`group_id` (`allura-faithmeats`) is the only hard tenant isolation boundary enforced
server-side. Binding `user_id` in the payload to the authenticated coworker token is
deferred to the hardened gateway phase (Story 6.1 AC6-AC7).

**Hardening conditions applied (Pike review):**

| # | Condition | Where enforced |
|---|-----------|----------------|
| 1 | validate-before-reload atomic swap | `install-token-gateway.sh` + `mint-coworker-token.sh` `render_and_reload()` |
| 2 | flock on `.coworker-tokens.lock` | `mint-coworker-token.sh` all mutating subcommands |
| 3 | 401 gate for absent/unrecognised token | `allura-mcpo-gateway.Caddyfile.template` `@unauthorized` handler |
| 4 | path allow-list (`/docs*`, `/openapi.json*`, `/memory_*`) | `allura-mcpo-gateway.Caddyfile.template` `@allowed` + 404 fallback |
| 5 | Authorization header redacted from access log | `allura-mcpo-gateway.Caddyfile.template` `format filter` |
| 7 | `--rotate` (revoke-all + mint-one, same flock) | `mint-coworker-token.sh` `do_rotate()` |
| 8 | user_id self-reported limitation documented at mint surface | `mint-coworker-token.sh` header + `coworker-tokens.example` |
