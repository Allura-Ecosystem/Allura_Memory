# Story 27.1 — Base-Snapshot Authorization Design Spike

**Status:** done — spike filed at `docs/archive/allura/evidence/epic-27/spike-27.1-base-snapshot-authorization.md`, verified 2026-08-29: all cited seams exist at HEAD (principal-context, api-auth, inject-context, migrations 27/36/06/16), all 6 ACs satisfied by the spike note, no src/ changes.
**Owner:** Brooks + Knuth + Jobs
**Depends on:** Epic 25 closure (cleared), Epic 24 foundations (auth/RLS/tenant seams)
**Blocks:** 27.2, 27.3, 27.4, 27.5, 27.6

## Outcome

A bounded, design-only spike (no `src/` changes) that proves the authorized-base-snapshot
contract — a branch may inherit only from an authorized base snapshot within the same
group and workspace — validates cleanly against Allura's existing authorization seams
(PrincipalContext roles/scopes, effective-tenant seam, `workspaces.lock_mode`, tenant RLS),
and decides where branch state would live without creating a second memory authority.

## User Story

As a governed memory operator, I need to know exactly how "a branch inherits only from an
authorized base snapshot" maps onto the authorization machinery Allura already has — before
any dependency or branch mechanics are adopted — so that branch isolation is a property of
the existing tenant/workspace seams rather than a new parallel authority.

## Acceptance Criteria

- [x] The authorized-base-snapshot contract is defined as a typed invariant: base snapshot
      is identified by `group_id`, `workspace_id`, base revision hash, and a captured
      snapshot timestamp, and every fork request must carry the full identity. — Spike §2.
- [x] The spike maps the contract onto the effective-tenant seam (`resolveApiTenant`) and
      `PrincipalContext` (`tenantIds`, `workspaceId`, `roles`, `scopes`), stating exactly
      which seam rejects cross-group and cross-workspace inheritance and how (400/401/403
      mapping per the 24.12 seam contract). — Spike §3.1–§3.2.
- [x] `workspaces.lock_mode` gates are evaluated for branch lifecycle (create/fork/checkpoint/
      promote) — including which lock modes must block branch creation or promotion — and the
      spike documents the interaction with tenant RLS (`app.current_group_id` policies). — Spike §3.3–§3.4.
- [x] The spike decides where branch state lives (new tenant-scoped tables vs. views over
      existing tables vs. adapter-local state), with a concrete recommendation and a "no
      second memory authority" check: canonical `allura_memories` writes still require a
      curator-approved proposal. — Spike §4.
- [x] Explicit fail-closed paths are enumerated: cross-tenant fork → denied; unknown or
      un-authorized base revision → denied; branch under a read-only/no-agent-writes lock →
      denied; no client-supplied scope can mint authority. — Spike §5.
- [x] Spike note is filed under `docs/archive/allura/evidence/epic-27/spike-27.1-base-snapshot-authorization.md` and is explicitly marked as a spike, not implementation. — File exists, header banner marks SPIKE/DESIGN ONLY.

## Dependencies

- Epic 25 closure (blocker, now cleared).
- No runtime dependency: recon of existing seams only; no upstream dependency is adopted
  or executed in this story.

## Rollback

Design-only artifact; trivially revertible. No runtime behavior changes.
