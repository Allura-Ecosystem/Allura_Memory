# Allura Hosted Platform — Risks & Decisions

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Anchor: [BLUEPRINT.md](./BLUEPRINT.md) · Coverage: [REQUIREMENTS-MATRIX.md](./REQUIREMENTS-MATRIX.md)

---

## Architectural Decisions

### AD-01 — Server-side `group_id` injection

- **Status:** Decided (aligned to governed canon **ADR-001**, 2026-06-10)
- **Decision:** All tenant isolation is enforced by server-side scope injection. The **organization is the only tenant boundary** (`group_id`, e.g. `allura-faithmeats`); a **workspace** is a `workspace_id` sub-scope *inside* that `group_id`, isolated at the API/CHECK layer. Clients (humans and agents) never supply `group_id` or `workspace_id`. `allura-system` is platform-tier only.
- **Rationale:** Client-supplied scope keys are the single largest cross-tenant leak vector. Injecting server-side from the authenticated session/token removes the class of bug entirely. Modeling the org (not the workspace) as the `group_id` matches existing governed canon (ADR-001: team/workspace = role within a tenant, not its own `group_id`) and avoids `group_id` proliferation.
- **Alternatives considered:** Workspace = its own `group_id` per the original Notion plan (rejected — conflicts with ADR-001, mints a `group_id` per workspace); client-supplied `group_id` with validation (rejected — validation gaps leak); row-level security only (kept as defense-in-depth, not sole control).
- **Consequences:** Every code path that reaches storage must run behind Bumblebee with org `group_id` + `workspace_id`. Direct DB writes that bypass injection are forbidden. Cross-workspace reads within an org are blocked at the API/CHECK layer.
- **References:** F6, F15, RK-01; governed canon ADR-001.

### AD-02 — Agents authenticate with scoped MCP tokens

- **Status:** Decided
- **Decision:** Agents authenticate with scoped MCP tokens, not human sessions or cookies.
- **Rationale:** Agent credentials need independent lifecycle (rotate/revoke/expire) and least-privilege scopes that differ from human roles.
- **Alternatives considered:** Shared service account (rejected — no per-agent revoke); human session reuse (rejected — over-privileged).
- **References:** F7, F13, RK-03.

### AD-03 — Token hashes only

- **Status:** Decided
- **Decision:** Raw MCP tokens are never stored; only a hash plus a display prefix.
- **Rationale:** A DB compromise must not yield usable credentials.
- **References:** F7, RK-03.

### AD-04 — Agents cannot self-approve

- **Status:** Decided
- **Decision:** Agents cannot approve their own (or any) memory promotions. Promotion requires a human/reviewer.
- **Rationale:** HITL is the integrity guarantee that separates logs from trusted knowledge.
- **References:** F22, RK-05.

### AD-05 — Append-only audit on every write

- **Status:** Decided
- **Decision:** All memory writes and all permit/deny decisions produce append-only audit records.
- **Rationale:** Reversibility and regulator-grade traceability are the product, not an add-on.
- **References:** F12, F24, RK-06.

### AD-06 — Versioned semantic memory via supersession

- **Status:** Decided
- **Decision:** Semantic memory (Neo4j) is versioned via `SUPERSEDES`; historical nodes are never mutated or deleted.
- **Rationale:** Immutable history enables audit and rollback.
- **References:** F18.

### AD-07 — Bumblebee is the single policy gate

- **Status:** Decided
- **Decision:** Bumblebee sits in front of all MCP and API actions as the policy gate.
- **Rationale:** One controlled door enforces auth, scope, rate limits, injection, and audit consistently.
- **References:** F6–F12, RK-10.

### AD-08 — Dashboard is a control plane, not source of truth

- **Status:** Decided
- **Decision:** The Memory Command Center is a control plane. It reads/acts through the governed API; it is not a memory store.
- **Rationale:** Prevents a UI path that bypasses governance.
- **References:** RK-10.

### AD-09 — RuVector stays optional and governed

- **Status:** Decided
- **Decision:** RuVector (MIT) may accelerate search but is optional and must run inside Allura Guard (group_id, scopes, audit, provenance). MVP uses ideas-only (Level 1); production path is an adapter (Level 3).
- **Rationale:** Keep Allura the memory authority; avoid coupling base boot to an optional dependency.
- **Alternatives considered:** Vendoring (Level 4) / fork (Level 5) — deferred unless RuVector becomes core.
- **References:** RK-08; CI license/security/governance gates.

### AD-10 — Dream Engine is platform-agnostic, proposal-only

- **Status:** Decided
- **Decision:** The Allura Dream Engine accepts many providers (Claude, OpenAI, Gemini, local, etc.) and only ever emits Dream Candidates for HITL review. No provider writes trusted memory.
- **Rationale:** Avoid vendor lock-in and preserve the approval invariant.
- **References:** F31, F32, RK-02.

---

## Risk Summary

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| RK-01 | Cross-tenant memory leakage | Critical | 🔴 Open |
| RK-02 | Prompt injection through retrieved memory | High | 🔴 Open |
| RK-03 | Leaked MCP token | High | 🔴 Open |
| RK-04 | Agent loop causing write/search abuse | Medium | 🔴 Open |
| RK-05 | Human reviewer approves bad memory | Medium | 🔴 Open |
| RK-06 | Audit log tampering | High | 🔴 Open |
| RK-07 | Backup/restore failure | High | 🔴 Open |
| RK-08 | Secrets accidentally stored in memory | High | 🔴 Open |
| RK-09 | Offboarding misses active tokens | Medium | 🔴 Open |
| RK-10 | Dashboard bypasses governed API paths | High | 🔴 Open |

---

## Risk Entries

### RK-01 — Cross-tenant memory leakage
- **Severity:** Critical · **Likelihood:** Medium · **Status:** 🔴 Open
- **Description:** A request reads/writes memory outside its workspace.
- **Mitigation:** Server-side `group_id` injection (AD-01); CI group_id boundary tests; DB CHECK constraint on `group_id` pattern; defense-in-depth row-level filters.
- **Related decision:** AD-01.

### RK-02 — Prompt injection through retrieved memory
- **Severity:** High · **Likelihood:** High · **Status:** 🔴 Open
- **Description:** Stored memory contains instructions that hijack an agent on retrieval.
- **Mitigation:** Prompt-injection warning layer on retrieved memory; treat memory as untrusted data (per `.claude/rules/agent-routing.md`); redaction before storage.
- **Related decision:** AD-10.

### RK-03 — Leaked MCP token
- **Severity:** High · **Likelihood:** Medium · **Status:** 🔴 Open
- **Mitigation:** Hash-only storage (AD-03); expiry; revoke/rotate; last-used tracking; rate limits; scope minimization.

### RK-04 — Agent loop / abuse
- **Severity:** Medium · **Likelihood:** Medium · **Status:** 🔴 Open
- **Mitigation:** Rate limits per token/user/workspace/agent; circuit breaker / budget caps; workspace lock modes.

### RK-05 — Reviewer approves bad memory
- **Severity:** Medium · **Likelihood:** Medium · **Status:** 🔴 Open
- **Mitigation:** Required rationale; evidence preview; supersession (reversible); promotion history.

### RK-06 — Audit log tampering
- **Severity:** High · **Likelihood:** Low · **Status:** 🔴 Open
- **Mitigation:** Append-only writes (AD-05); audit hash chain; export receipts; restricted mutation roles.

### RK-07 — Backup/restore failure
- **Severity:** High · **Likelihood:** Medium · **Status:** 🔴 Open
- **Mitigation:** Documented + tested restore ([BACKUP-RESTORE.md](./BACKUP-RESTORE.md)); CI restore/checkpoint test; restore receipts.

### RK-08 — Secrets stored in memory
- **Severity:** High · **Likelihood:** Medium · **Status:** 🔴 Open
- **Mitigation:** Secret scanning before storage (F10); CI secret-scan gate; redaction layer in Dream Engine.

### RK-09 — Offboarding misses active tokens
- **Severity:** Medium · **Likelihood:** Medium · **Status:** 🔴 Open
- **Mitigation:** Offboarding flow revokes all tokens for a user; mcp-token-auditor skill flags stale tokens.

### RK-10 — Dashboard bypasses governed API
- **Severity:** High · **Likelihood:** Low · **Status:** 🔴 Open
- **Mitigation:** AD-08 (control-plane only); no direct DB access from UI; governance gate in CI.

---

## References

- [BLUEPRINT.md](./BLUEPRINT.md)
- [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md)
- [REQUIREMENTS-MATRIX.md](./REQUIREMENTS-MATRIX.md)
- [SECURITY.md](./SECURITY.md) · [THREAT-MODEL.md](./THREAT-MODEL.md)
