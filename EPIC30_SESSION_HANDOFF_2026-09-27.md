# Epic 30 session handoff

Date: 2026-09-27
Runtime: Codex Desktop / Astra session

## Important repository state

The implementation worktree used during this session (`/tmp/allura-epic30-remote-reconciliation`) no longer exists. Its branch and commit are not present in the surviving repository. Do not claim that the implementation from that worktree was committed. The surviving checkout is `main` at `cc9acd2b1fc1ddbb23999717354cb7eb065789d2`.

I intentionally did not stage the existing untracked files or unrelated artifact folders in the parent checkout.

## Work verified before the worktree disappeared

- Disposable local PostgreSQL only; no production database changes.
- Local admin membership directory showed seven fictional memberships, tenant role separate from workspace access, and revoked-user as removed/revoked.
- Report-only policy preview did not mutate access and could not override tenant removal.
- Browser admin workflow revoked fictional `contractor-user` from workspace version 1 to version 2, then restored it to version 3; tenant role remained `viewer`.
- Browser two-session workflow used owner on `127.0.0.1:4100` and admin on `127.0.0.1:4101` against one disposable database. Revoking `owner-user` caused the already-open owner page to switch to `Access not permitted`; document names, content, tabs, and graph were hidden. Restoring access returned the five authorized documents after a fresh server response.
- Permission history displayed applied revoke/restore events with receipt, actor, membership version, witness hash, and applied time.
- Focused hermetic suite reached 420 passed / 3 skipped; focused live PostgreSQL transition and owner-document revocation tests passed; typecheck passed before the final freshness/paired-demo edits.
- A graph warning was observed after restoration: `DocumentGraph` updates React state from the force-graph `onZoom` callback during renderer render. This was identified but not fixed before the worktree disappeared.

## Remaining work

1. Recover or recreate the implementation on a real git branch before continuing.
2. Re-run typecheck and the full hermetic suite after the final paired-demo and authority-guard edits.
3. Fix the force-graph `onZoom` render warning and verify the browser console is clean.
4. Finish tenant-role editing with the same approval, receipt, version, and audit rules.
5. Verify Ask Allura with an approved no-retention provider; currently the UI truthfully says it is unavailable.
6. Reconcile the one BMAD acceptance checklist instead of adding more status files.
7. Commit the recovered implementation on a `codex/` branch. Push only if explicitly requested.

## Safety

All accounts and data above were fictional disposable fixtures. The canonical Allura endpoint and production configuration were not changed. The next session must not use the stale browser tabs as proof until a new local demo receipt is created.
