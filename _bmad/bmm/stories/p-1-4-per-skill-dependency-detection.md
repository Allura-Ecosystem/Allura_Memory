# Story P-1.4 — Per-Skill Dependency Detection

**Status:** Planned
**Owner:** Woz + Pike
**Depends on:** P-1.1
**Blocks:** P-1.5

## Outcome

Each skill gracefully no-ops when a required service is absent, instead of crashing or producing misleading errors.

## Acceptance Criteria

- [ ] Every skill declares its service dependencies in its manifest.
- [ ] Skills check for service availability at startup and no-op with a clear message when absent.
- [ ] No skill crashes or produces misleading output when a dependency is missing.
- [ ] Dependency detection is tested with services absent and present.

## Evidence

- Skill dependency declarations.
- No-op behavior tests with absent services.
- Clear message output examples.

## Rollback

Skills may crash when services are absent. Plugin remains installed but unreliable without all services.