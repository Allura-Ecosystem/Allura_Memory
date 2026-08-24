# Rollout Note — Fail-Closed Web Authority (Story 24.11a)

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (Claude Code).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

**Date:** 2026-08-23
**Story:** `_bmad/bmm/stories/24-11a-fail-closed-web-authority.md`
**Scope of this note:** AC-3. Enumerates every route family whose authorization
changes when this story merges, the expected breakage, and the rollback.
**Status:** written by the implementing agent. Not reviewed, not signed off.

---

## 1. What changed

`src/proxy.ts` previously resolved production authority from a hardcoded
`ROLE_GATES` table (13 matchers, 8 route families). Any pathname that matched
no gate fell through to `nextWithoutAuthHeaders` — served fully
unauthenticated. `src/lib/auth/route-scope-manifest.ts` declared 46 entries
that the production branch never consulted.

After this change:

- `ROLE_GATES` is deleted.
- Both the production (Clerk) branch and the dev-auth branch call
  `resolveRouteAuthority(pathname)` from the manifest.
- Resolution is fail closed and has exactly three outcomes:

  | Outcome | Condition | Effect |
  |---|---|---|
  | `public` | matches `PUBLIC_ROUTE_MANIFEST` | served with no principal, `x-allura-*` headers stripped |
  | `declared` | matches `ROUTE_SCOPE_MANIFEST` | principal required at the declared role |
  | `undeclared` | matches neither | principal required at `UNDECLARED_ROUTE_ROLE` = **admin** |

- `ROUTE_SCOPE_MANIFEST` is checked before `PUBLIC_ROUTE_MANIFEST`, so a
  careless broad public pattern cannot un-gate a declared route.

## 2. Rollout decision — already made, recorded here only

**Fail closed immediately.** Not log-only-then-enforce. Rationale from the
story: nothing is live. There is no working sign-in (Story 25.2b) and no
dashboard (Story 25.4). The consumers of the currently-open routes are internal
scripts, the curator watchdog, and local development — not users. This note
does not re-open that decision; it documents its consequences.

## 3. Newly enforced — Class A: declared in the manifest, ungated in production

These families are declared in `ROUTE_SCOPE_MANIFEST` today but were **not**
matched by `ROLE_GATES`, so the production Clerk branch served them
anonymously. They now enforce their declared role.

| Route family | Newly enforced role |
|---|---|
| `/api/curator/reject` | curator |
| `/api/audit/:path*` (including `events`; excluding the explicit `cross-tenant` exception) | curator |
| `/api/audit/cross-tenant` | admin |
| `/api/mcp-catalog/:path*` (import, approve, deny, profile(s), candidates) | admin |
| `/api/tokens`, `/api/tokens/:path*` | admin |
| `/api/members`, `/api/members/:path*` | admin |
| `/api/workspaces`, `/api/workspaces/:path*` | viewer |
| `/api/agents`, `/agents` | viewer |
| `/api/projects` | viewer |
| `/api/skills` | viewer |
| `/api/metrics` | viewer |
| `/api/stream` | viewer |
| `/api/users/:path*` | viewer |
| `/api/groups/:path*` | viewer |
| `/api/scheduled-tasks`, `/api/scheduled-tasks/:path*` | viewer |
| `/api/settings`, `/api/settings/:path*` | viewer |
| `/api/teams`, `/api/teams/:path*` | viewer |
| `/api/dreams`, `/api/dreams/:path*` | viewer |
| `/dashboard`, `/dashboard/:path*` | viewer |
| `/allura`, `/command`, `/resources`, `/telemetry`, `/work-board` | viewer |
| `/api/brain/memories`, `/api/brain/search` (newly declared, AC-4) | viewer |

Some rows are declarations without a handler on disk today (`/api/scheduled-tasks`,
`/dashboard`, and the `:path*` sub-route entries for settings/teams/dreams/workspaces).
They are listed because the gate will enforce them the moment those handlers land.

## 4. Newly enforced — Class B: explicit admin pending Story 24.11b review

These pre-existing handlers are now explicitly declared in
`ROUTE_SCOPE_MANIFEST` as **admin** under the `pending-review:*` naming
convention. Each description records that Story 24.11b must make the reviewed
least-privilege assignment. These routes were previously outside `ROLE_GATES`
and could fall through unauthenticated in the production Clerk branch. The new
admin role is a conservative fail-closed assignment, not a claim that prior
runtime authority was already fail-closed.

- `/api/coherence/conflicts`, `/api/coherence/resolve`
- `/api/curator/metrics`
- `/api/evidence/[id]`
- `/api/execution-overview`
- `/api/genesis/proposals`, `/api/genesis/proposals/approve`, `/api/genesis/proposals/reject`
- `/api/handoffs`, `/api/handoffs/[id]`, `/api/handoffs/[id]/acknowledge`, `/api/handoffs/[id]/reject`
- `/api/projects/[id]`
- `/api/runs`, `/api/runs/[id]`, `/api/runs/[id]/breakpoints`, `/api/runs/[id]/cancel`, `/api/runs/[id]/doctor`, `/api/runs/[id]/events`, `/api/runs/[id]/resume`
- `/api/tenants`, `/api/tenants/[group_id]`
- `/api/tracking/skill-usage`
- `/api/trajectories`, `/api/trajectories/stats`
- `/api/work-items`, `/api/work-items/[id]`, `/api/work-items/[id]/transition`

**Follow-up required.** Story 24.11b must replace each pending-review admin
entry with a reviewed role. Admin is safe but may be too restrictive: a
viewer-appropriate read surface such as `/api/trajectories/stats` should not
remain admin after design review. The entries are deliberately not widened in
this story — inventing authority levels without review is the security failure
this story exists to eliminate.

## 5. Explicitly public — `PUBLIC_ROUTE_MANIFEST`

Every entry carries a required `rationale` field; a unit test asserts none is
empty.

| Pattern | Rationale (short form) |
|---|---|
| `/` | Unauthenticated landing surface, renders no tenant data |
| `/auth/:path*` | Sign-in must be reachable before a principal exists |
| `/api/auth/:path*` | Clerk-owned auth API; provider authenticates, not this gate |
| `/api/health`, `/api/health/:path*` | Orchestration probes, subsystem status only |
| `/api/live`, `/api/ready` | Container liveness/readiness probes |
| `/api/trace` | Internal audit sink, shared-secret authorized. See §6. |
| `/api/mcp`, `/api/mcp/:path*`, `/mcp` | MCP transport, Bearer-token authenticated |
| `/api/brain/health` | AC-4. Liveness report only, no memory content. See §7. |

## 6. Why `/api/trace` must stay public

`emitGatedAudit()` runs inside the Edge gate and POSTs to `/api/trace` with the
`x-internal-trace` shared secret. It emits events for *denied* requests, which
by definition have no principal. Gating `/api/trace` on a principal would
silence the audit trail for exactly the requests that matter most. The route
handler carries its own comment forbidding `withPermission`/`requireRole`
guards. This is a deliberate exception, not an oversight.

## 7. `/api/brain/*` (AC-4)

- `/api/brain/memories` and `/api/brain/search` returned real memory content
  with **zero** authentication and a hardcoded `group_id = "allura-system"`.
  They now require an authenticated principal (viewer) at both the proxy gate
  and the handler, and derive `group_id` from the principal.
- `/api/brain/memories` previously defaulted `user_id` to the literal string
  `"ronin704"` when the query parameter was absent. It now defaults to the
  calling principal's id. **Any caller relying on the `ronin704` default will
  see different rows.** Pass `?user_id=ronin704` explicitly to restore it.
- `/api/brain/health` stays public, declared with a rationale: it calls
  `audit_health_report`, which returns subsystem status and queue depth only,
  never memory content — consistent with the other `/api/health/*` probes. If
  that handler ever returns tenant rows, move its declaration to
  `ROUTE_SCOPE_MANIFEST`.

## 8. Incidental fixes — matcher semantics

`matchesPattern()` expanded `"/api/audit/:path*"` to a regex requiring a double
slash, so **every** `"/x/:path*"` entry in both manifests matched nothing.
Under the old permissive fall-through this was invisible. Under fail-closed it
would have gated `/auth/v2/login` itself and produced a redirect loop. Fixed,
with a regression test. Consequence: the `:path*` entries in the manifest are
now live for the first time — `/api/audit/*` moves from admin (undeclared) to
curator **except** `/api/audit/cross-tenant`, whose exact `admin` declaration
wins over the wildcard. `/api/users/*` and `/api/groups/*` move from admin to
viewer, matching their declared intent.

Ordinary Next.js dynamic segments now match one nonempty segment: for example,
`/api/memory/:id/restore` matches `/api/memory/abc/restore`, not a path with an
embedded slash. This lets the concrete admin declarations for restore and user
memory deletion win before the broader `/api/memory/:path*` viewer entry.

## 9. Expected breakage

1. **Unauthenticated internal scripts.** Any script or cron calling the Class A
   or Class B routes without an `x-allura-*` principal (or a Clerk session in
   production) now receives `401`. Page routes receive a `307` redirect to
   `/auth/v2/login`.
2. **Under-privileged callers.** A viewer principal calling a Class B route
   receives `403` with `required: "admin"`.
3. **`/api/brain/memories` default user.** See §7.
4. **Local development is unaffected by default.** `ALLURA_DEV_AUTH_ROLE`
   defaults to `admin`, so the dev-auth principal satisfies every gate
   including the undeclared-route default. Setting it to `viewer` will surface
   Class B denials locally — a useful way to preview production behaviour.
5. **`/api/health/metrics` remains public** via `/api/health/:path*` and reads
   a client-supplied `group_id`. That is pre-existing and out of scope here;
   it belongs to Story 24.11b's per-route reconciliation work.

## 10. Monitoring

Denials emit `api_request_gated` events. Filter on
`metadata.verdict in ("unauthorized", "forbidden")`, and specifically on
`metadata.scopeName` beginning with `pending-review:` to find Class B traffic
— a spike there identifies the routes awaiting Story 24.11b review.

## 11. Rollback

Ordered from cheapest to most complete.

1. **Widen one route.** Add a `ROUTE_SCOPE_MANIFEST` entry with the intended
   role, or a `PUBLIC_ROUTE_MANIFEST` entry with a written rationale. Single
   file, no proxy change.
2. **Neutralise the fail-closed default only.** Set
   `UNDECLARED_ROUTE_ROLE` in `src/lib/auth/route-scope-manifest.ts` to
   `"viewer"`. Class B routes then require any authenticated principal instead
   of admin. Class A enforcement is unaffected. This preserves the security
   fix (nothing is anonymous) while removing the privilege escalation.
3. **Full revert.** Revert the commit touching `src/proxy.ts`,
   `src/lib/auth/route-scope-manifest.ts`, `src/lib/auth/api-auth.ts`, and
   `src/app/api/brain/**`. This restores `ROLE_GATES` and, with it, the
   unauthenticated fall-through — the CVE-class defect this story closes.
   Only acceptable as an emergency measure, and only while nothing is live.

There is no feature flag. The story recorded that decision deliberately: a flag
defaulting to "off" reproduces the defect, and a flag defaulting to "on" is the
same as no flag.

## 12. References

- `_bmad/bmm/stories/24-11a-fail-closed-web-authority.md`
- `src/proxy.ts`
- `src/lib/auth/route-scope-manifest.ts`
- `src/lib/auth/api-auth.ts`
- `src/__tests__/auth-middleware.test.ts`
- `src/lib/auth/__tests__/with-permission-action.test.ts`
