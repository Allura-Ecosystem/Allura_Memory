# Story P-2.2 — Auth and Tenant Scoping — Group_id Propagation

**Status:** Planned
**Owner:** Brooks + Knuth
**Depends on:** P-2.1
**Blocks:** P-2.3

## Outcome

`group_id` is inherited from the delegation context, not self-asserted by the subagent. Cross-tenant access is denied.

## Acceptance Criteria

- [ ] `group_id` is passed through the delegation chain — children inherit parent's tenant.
- [ ] A subagent working on `allura-faithmeats` cannot read `allura-difference-driven` memories.
- [ ] Missing `group_id` returns a typed error, not a fallback to a default tenant.
- [ ] Tenant forgery is denied with a 403 and logged.

## Evidence

- Tenant propagation tests.
- Cross-tenant denial tests.
- Tenant forgery denial tests.

## Rollback

Subagents may self-assert group_id. Cross-tenant access is possible — security regression.