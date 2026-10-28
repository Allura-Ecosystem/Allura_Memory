---
title: Story7.3 bounded confirmed projection delivery and operator reconciliation
type: feature
created: 2026-10-28
status: done
route: dispatch
baseline_commit: 8bc33180b2afb3a122e7ff72482eab3273418f39
context: []
---
<frozen-after-approval>
## Intent
Exercise real bounded HTTP delivery to owned disposable Notion-shaped fixtures, preserve durable unknown outcomes across restart, and expose truthful authenticated delivery observations. Synced requires a fresh authenticated GET comparing exact source/content/target/digest; neither PATCH response nor outbox success qualifies. Existing user approves local7, not actual external writes.
## Boundaries
Keep independent human semantic approval and explicit current human-admin source→destination transfer. Default transport registry empty; credentials and immutable destinations installed server-side only, never supplied in HTTP bodies. Fixtures use synthetic tokens and loopback; no real credential lookup, external transfer, production migration, deployment/push or new grants. Preserve parent README, retained approved UI/interactive graph and10.1. No developer reviewers.
## I/O matrix
- Given eligible due transfer, when one worker claims and GET finds reserved properties empty, commit write_started then issue at most one PATCH and independent GET; mark synced only for matching read-back.
- Given timeout/crash after write marker, when a restarted worker resumes, GET-only reconciliation even if target still empty; never blindly duplicate mutation.
- Given changed content/page/parent/binding or malformed read-back, when examined, record conflict without corrective overwrite. Failed or synced terminal state cannot be reopened by stale work.
- Given revoked/locked/expired identity/source/transfer, when any outbound phase begins, current DB locks deny it before network; historical observations never imply current permission.
- Given429/deadline/oversize/redirect/partial transport, retain unknown and bounded due/cap discipline; never leak tokens, bodies, URLs or arbitrary error strings to clients/logs.
- Given explicit operator action, when authenticated same-origin routes authorize/process/revoke/read, enforce existing CSRF/authority/input bounds and render safe observations separately from immutable receipts. Anonymous/foreign/forged-status input cannot trigger network.
- Given retained command-center view, when actual browser uses delivery controls, actions work and denied/stale/unknown results remain truthful. No count-card graph substitution.
</frozen-after-approval>
## Code Map
Reuse projection.ts transaction guard/claims/write marker/comparator finish and projection-contract.ts exact destination/envelope. New projection-delivery.ts low-level Node HTTP(S) transport with strict target-scoped registry/no redirects/no ambient proxy/cookies,2s deadline/128KiB cap/finite concurrency; explicit process-one command, no daemon. New projection-api.ts routes integrated in core-api.ts; default no configured adapter. Existing gateway.ts supplies signed human identity/current authority/body/cancellation/redacted errors. Add minimal delivery section within existing UI and real browser fixture. tests/projection-delivery.test.ts uses actual restricted PostgreSQL and local HTTP fixture, not invented response success evidence.
## Tasks
- [x] Red-first real network success/ack-only/delayed unknown/restart/duplicate/revocation/conflict tests.
- [x] Bound target registry, wire deadlines/caps/redirect refusal, claims and fresh read-back orchestration.
- [x] Authenticated same-origin commands and separate redacted observation query, default disabled adapter.
- [x] Retained-shell operator controls with real browser action/denial evidence.
- [x] Full composite/direct self-check; actual external acceptance explicitly open. Local Epic7 retrospective follows story acceptance before the next epic.
## Design Notes
No real target is authorized. Node http/https request avoids ambient fetch proxies and automatic redirects/retries; TLS verification stays default. One reserved immutable page per transfer. Current locks held only across each bounded request; write_started commits before PATCH. Unknown/commit error is not repaired by a second write. Automatic attempts remain capped at5; exhausted unknown stays unknown and is displayed for human disposition. No new beyond-cap retry command in this slice. Each request maximum2s; gateway's5s cancellation can interrupt multi-phase delivery truthfully.
## Verification
Raw logs Operations/direct-build-20261026/admission27-*.log. Fixture transport evidence is local only. Hosted CI, actual external compatibility/transfer/exclusive destination policy and6/9 release requirements remain open; no whole-product completion.

## Local acceptance and direct self-check —2026-10-28
`bun run check:all` exit0, Operations/direct-build-20261026/admission28-projection-full.log:216tests/2176assertions plus617 actual browser assertions/10scenarios; typecheck/lint pass, required discovery nonzero/no missing cases. Restricted PostgreSQL153/1359, unit63/817. Actual desktop screenshot admission28-browser/projection-delivery.png inspected; retained responsive/graph/control suites also ran. No independent developer review.

Matrix rows1–3: projection-delivery.test.ts real GET/PATCH/GET, ack-only unknown, late write/fresh process restart and crash marker; projection-contract.test.ts exact Unicode/content/page/parent/binding conflicts. Rows4–5: projection.test.ts current authority/source locks, fence/due/exhaustion and commit failure; projection-delivery.test.ts revoked/no network, redirect/oversize/malformed/rate/stall and cancellation. Rows6–7: authenticated HTTP rejection/redaction and projection-browser.test.ts authorization, cancellation, synced, revoked historical observation, unknown, wrong-transfer response rejection and revoked-access clearing.

Self-check traced gateway→service→restricted private functions and registry→bounded transport→fresh comparator→separate observation. DB completion helpers remain trusted service boundaries, never caller-supplied status/page routes. Fixed Bun ClientRequest.close-before-response.end behavior using response lifecycle; fixed UI observation ID binding and portable screenshot output (ALLURA_UI_EVIDENCE or owned fixture directory). Raw failed/retry logs retained. Prior single degraded retrieval evaluation remains an unproven timing hazard, not hidden by relaxed tests; unchanged final27 and full28 passed. Local story scope accepted; real Notion target/credentials/transfer and hosted/deployed release not performed.
