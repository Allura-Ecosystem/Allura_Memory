# Story 23-4 — Fix Token Compliance Failures

**Epic:** Epic 23 — Neo4j Sunset Completion
**Status:** ready-for-dev
**Priority:** P1-High | **Complexity:** Small
**Agent:** Woz

**Description:**
Token compliance test reports 19 raw hex color references and 13 deprecated token references in target directories. Replace raw hex colors with design tokens and update deprecated token references.

## Acceptance Criteria

- [ ] Token compliance test passes (0 hex colors, 0 deprecated tokens)
- [ ] All raw hex colors replaced with CSS custom properties or design token imports
- [ ] All deprecated token references updated to current tokens
- [ ] `bun run test:unit` — no new failures introduced

## Implementation Files

- Files with hex colors (19 occurrences — identified by token compliance test)
- Files with deprecated tokens (13 occurrences — identified by token compliance test)

## Dev Notes

Run the token compliance test first to get the exact file list. The test is in the test suite — check `src/__tests__/` for token compliance.

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Run token compliance test to identify all 19 hex colors and 13 deprecated tokens
- [ ] 2. Replace each hex color with the appropriate design token
- [ ] 3. Update each deprecated token to the current token name
- [ ] 4. Run token compliance test — must pass
- [ ] 5. Run full test:unit — no new failures

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)