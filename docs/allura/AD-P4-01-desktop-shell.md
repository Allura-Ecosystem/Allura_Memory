# AD-P4-01: Desktop Shell Decision

**Status:** Decided
**Date:** 2026-06-12
**Decision Owner:** Brooks (brooks-architect)

## Context

The parity audit requires an explicit desktop-shell decision before Phase 4 can proceed. Two options were identified:

1. **Electron/Tauri shell** — build a standalone desktop app wrapping the Next.js dashboard
2. **AionUI fork** — fork and adapt the AionUI desktop coworking shell

## Decision

**Defer desktop packaging to post-beta.** The web dashboard served via Next.js on localhost is the desktop experience for now.

### Rationale

1. The dashboard is already accessible at `localhost:3100` in development and via Docker in production
2. Desktop packaging (Electron/Tauri) adds build complexity, signing, auto-update, and OS-specific testing — none of which advances the 10-point acceptance gate
3. AionUI source provenance is unresolved (noted in the parity audit: "previous local Aion source path is absent from the current machine")
4. Every acceptance gate criterion (create work item, start run, approve breakpoint, etc.) can be tested through the web dashboard

### What This Means

- No Electron/Tauri packaging in this goal
- The web dashboard IS the desktop product for beta
- Desktop-native features (secure credential storage, process supervision, deep links) are post-beta work
- This decision can be revisited when the acceptance gate passes

## Consequences

- Beta users access Allura via browser at localhost
- No native OS notifications or menu bar integration
- No native file system access (evidence viewing through browser)
- Faster iteration on dashboard features without desktop build overhead

## Alternatives Considered

1. **Electron wrapper** — rejected: adds 6+ work packages (packaging, signing, updates, supervision, credentials, reconnect) with no acceptance gate coverage
2. **Tauri wrapper** — rejected: same scope as Electron, smaller ecosystem
3. **AionUI fork** — rejected: source provenance unresolved, dependency on external project

## References

- `docs/reviews/ALLURA-BABYSITTER-HERMES-AION-AUDIT-2026-06-12.md` § Desktop Readiness
- `ralph/goals/goal-20260612-1800.md` Task 16-17
