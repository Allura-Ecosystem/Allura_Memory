# Board Screenshot Evidence - 2026-05-17

## Scope

This artifact records visual evidence for the public board cockpit routes after
`agent-browser` became available as the browser automation path.

## Tooling

- Tool: `agent-browser`
- CLI version: `0.26.0`
- Runtime override: `XDG_RUNTIME_DIR=/tmp/agent-browser-runtime`
- Reason for elevated browser run: default sandbox blocked the daemon/browser
  launch path even though `agent-browser doctor --offline --quick` passed.
- Local target: `http://127.0.0.1:3334`

## Captures

Desktop viewport: `1440x1200`

- `/boards`: `artifacts/boards-screenshots-2026-05-17/boards-desktop.png`
- `/boards/memory-ops`: `artifacts/boards-screenshots-2026-05-17/memory-ops-desktop.png`
- `/boards/agent-readiness`: `artifacts/boards-screenshots-2026-05-17/agent-readiness-desktop.png`

Mobile viewport: `390x844`

- `/boards`: `artifacts/boards-screenshots-2026-05-17/boards-mobile.png`
- `/boards/memory-ops`: `artifacts/boards-screenshots-2026-05-17/memory-ops-mobile.png`
- `/boards/agent-readiness`: `artifacts/boards-screenshots-2026-05-17/agent-readiness-mobile.png`

## Result

The board cockpit routes have desktop and mobile screenshot evidence for the
Phase 2 visual-evidence gate.

This does not close the broader Phase 4 `3100` cutover gate. Visual parity,
route parity, authenticated/unauthenticated validation, runtime health, tested
rollback, and Captain approval remain required before replacing `3100`.

## Receipts

- Notion: `3631d9be-65b3-8167-af39-fe1e8e0a074c`
- Brain: `7ab42d42-78d3-4a34-95b6-be7f8089d490`
