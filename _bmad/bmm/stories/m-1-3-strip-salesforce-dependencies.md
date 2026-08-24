# Story M-1.3 — Strip Salesforce Dependencies

**Status:** Planned
**Owner:** Woz + Hightower
**Depends on:** M-1.1
**Blocks:** M-1.4

## Outcome

Salesforce-specific code, manifests, and data are removed or archived. No Salesforce imports remain in the active codebase.

## Acceptance Criteria

- [ ] `force-app/` directory moved to archive or removed.
- [ ] `manifest/` directory moved to archive or removed.
- [ ] `data/` directory moved to archive or removed.
- [ ] `jest.config.js`, `jest.setup.a11y.js` — evaluated: keep if reusable, archive if Salesforce-specific.
- [ ] `mortagate.gates.json` — evaluated: keep if gate definitions are reusable for co-work.
- [ ] `grep -ri "salesforce\|force-app\|lwc\|apex" src/` returns zero results (excluding archive).
- [ ] `package.json` has no Salesforce dependencies.

## Evidence

- Archive directory listing.
- Grep results showing zero Salesforce references.
- Updated package.json.

## Rollback

Restore from archive. Salesforce code is reactivated.