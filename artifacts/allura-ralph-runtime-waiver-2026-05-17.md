# /allura Ralph Runtime Waiver

Date: 2026-05-17  
Scope: B02 / B08 `/allura` review and 6420 -> 3334 reachability gates  
Authority: Brooks runtime waiver for Ralph Loop only

## Waiver Decision

Ralph Loop validation is formally waived for the `/allura` Phase 0 review gate
because the nested runtime path is blocked by an environment-level sandbox
failure:

```text
bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted
```

This waiver does not waive the actual product requirements. It waives only the
Ralph runtime execution requirement for this gate.

## Evidence Substituting For Ralph

Direct evidence already proves the route behaviour Ralph would validate:

- PR #29 / commit `ae7c11116fba28c4aa493ec74482574b10bf181e`
- `artifacts/allura-runtime-trust-evidence-2026-05-16.md`
- `artifacts/allura-playwright-smoke.json`
- `artifacts/allura-benchmark-2026-05-16.log`
- `artifacts/allura-after-3334.png`
- Notion evidence comments `3621d9be-65b3-8184-9729-001d5879e69c`, `3621d9be-65b3-8133-8097-001d26453eda`, and `3631d9be-65b3-816b-96aa-001d27b0d322`
- Allura Brain receipt `c6ade62b-4f8c-4ddc-bf19-e1704262249e`

## Direct Validation Summary

From the evidence pack:

- `http://localhost:3334/allura` returned `200`.
- Page title was `Governed memory command center`.
- Browser smoke passed at 1440, 1280, 768, and 375 widths.
- Horizontal overflow was `false`.
- Page errors were `[]`.
- Console messages were React devtools informational messages only.
- Six tabs rendered and keyboard navigation selected the expected tabs.
- IBM Plex Sans was active.
- Pike review: pass.
- Fowler review: pass.
- Targeted lint/typecheck/tests/build were recorded as passing in `artifacts/allura-runtime-trust-evidence-2026-05-16.md`.

## RuVix Receipt

- mutate: no runtime/product mutation; waiver records governance decision.
- attest: direct route evidence, browser smoke, benchmark log, Notion comments, Brain receipt.
- verify: waiver checks that missing evidence is runtime-specific, not product-specific.
- isolate: applies only to `/allura` Phase 0 B02/B08 Ralph Loop requirement.
- sandbox: avoids rerunning a known nested `bwrap` path that fails due environment permissions.
- audit: record this artifact, attach it to Notion, and log to Allura Brain.

## Limits

- This waiver does not approve future `3100` cutover.
- This waiver does not close B04 cash tracker scope.
- This waiver should be superseded by a real Ralph rerun if the nested runtime is fixed before final Phase 0 closeout.
