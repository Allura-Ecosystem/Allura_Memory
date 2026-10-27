# Core + operator staging acceptance packet — authorization required

Prepared by Brooks/Woz guidance in the single direct-build writer. This is a proposed release procedure and an evidence index, not deployment permission, a human signoff, or an operational task board. Story6.5/Epic6 and Story9.4/Epic9 remain open. No independent developer review occurred.

## Frozen local candidate

- Runtime: `0c274294ba57123b1167a0b103f3943e3e7781f1`, clean beta at test/pack time. Later documentation-only commits do not silently replace this candidate.
- Exact command: `ALLURA_CI_OUTPUT=<Operations>/releases/0c274294ba57123b1167a0b103f3943e3e7781f1 bun run ci 0c274294ba57123b1167a0b103f3943e3e7781f1`, exit0 at2026-10-27T19:32:07-04:00.194tests/1767assertions, six lanes: frozen install, typecheck, lint, unit, model, restricted disposable database.579 additional actual Chromium assertions across9 scenarios;27 route/viewport combinations at1440/820/390px;28 axe4.14.0 scans with zero reported violations. Forced-colors dialog has manual/incomplete aria-hidden-focus and color-contrast checks; this is not accessibility certification.
- CI receipt: `<Operations>/releases/0c274294ba57123b1167a0b103f3943e3e7781f1/allura-ci-9MUisw/attempt.json`; six log hashes, invocation/source/lock identity checked. Actual screenshots/scans/observations are in its `browser/` directory.
- Archive: `<Operations>/releases/0c274294ba57123b1167a0b103f3943e3e7781f1/allura-core-artifact-UZmsO6/allura-core-0.1.0-dev.1.tar.gz`.
- SHA256: `4c0952f220f9ba95010280ab31c4cab1e0042497ae590ad3b662f14cc178d87d`. Adjacent `pack-receipt.json` has sourceDirty=false and74 shipped input digests. Actual archive bytes and all74 extracted-in-memory member digests checked; no archive extraction into shared resources.
- `<Operations>` means `/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/direct-build-20261026`. Raw commands: `admission23-exact-ci.log`, `admission23-pack.log`. These are local evidence, NOT hosted CI or deployment receipts.

## Exact authority needed before staging

Sabir must name/approve the isolated nonproduction host and HTTPS origin, resource owner and permitted persistence/lifetime. No production hostname, existing database or account is assumed. Authorize installation/initialization of THIS candidate into a new empty isolated database, bounded model/runtime dependencies, and the agreed nonproduction routing/identity configuration. Use synthetic acceptance data only; do not copy production or confidential HR records. Do not use real production credentials. No purchase, public package publication, new Git branch/worktree or protected-main changes are proposed.

Separately decide whether pushing the approved beta revision to the existing authorized remote and triggering its hosted workflow is allowed. Local CI does not satisfy hosted acceptance, and staging approval alone does not authorize push. If the target requires configuration not covered by the authorization, stop on that exact boundary.

Identity/onboarding owner must supply approved stable human bindings, tenant/workspace IDs and explicit scoped roles/actions through the authorized provisioning route. At least a submitting human and a DIFFERENT entitled approving human must participate; organization administration alone grants no content access. Use an additional denied synthetic scope for confidentiality/revocation tests. Device credentials belong in the supported Linux Secret Service client, never pasted into browser fields/chat/logs. No agent impersonation of an actual human witness.

Before execution, record the authorization reference, named target/origin, exact artifact/source/CI identities, onboarding/resource owners, consented participants and rollback authority. These are intentionally UNASSIGNED until Sabir supplies authority, not fictitious provisioned resources.

## Launch/use procedure after authorization only

Use the shipped `foundation/core-package/README.md` / archive `README.md`, not a legacy deployment guide. Verify trusted archive checksum; extract into a new owned directory. Runtime pins are Bun1.3.14, Node24.19.0, PostgreSQL16.15, native RuVector and offline pinned MiniLM. Run documented `bun run install:frozen` and `bun run prepare:model`. Explicit `bun run init:empty` requires separately injected initializer credentials and a new empty database; it creates no human or grant. Remove initializer credentials before startup. Supply only the restricted application URL/stable cursor key and public HTTPS/Access configuration, then `bun run start ./config.json`.

The server binds127.0.0.1; external HTTPS/Access routing is separately authorized and verified. Browser-managed signed HttpOnly human cookie is required for content. Open `/dashboard`, enter exact tenant/workspace selectors, choose Open workspace and verify displayed current role/scope. Selectors never grant access. Capture remains authenticated device/agent MCP/SDK; the browser proposes against authorized evidence. Semantic approval always requires a separately entitled independent human. Indexing is explicitly bounded/manual, not an automatic daemon. Process liveness is not scoped readiness.

## Witness protocol (unperformed)

Use [9.1 task protocol](spec-9-1-operator-design-contract.md) and [6.5 core journey](spec-6-5-core-journey-witness.md). Without coaching, ask consented participants to:

1. Identify current workspace/role, find approved guidance, inspect its exact source and receipt; complete capture→pending proposal→independent human decision→later authorized retrieval.
2. Distinguish current from superseded/deprecated memory; submit a correction and verify immutable old version/lineage after a fresh independent decision.
3. Follow one real persisted graph relationship using Graph and keyboard/List; explain that position is layout, not semantic similarity. Test root/depth/history/evidence filters, pan/zoom and inspector focus.
4. Request evidence, reject and approve exact versions with rationale as appropriate. Confirm self/machine approval denial, stale409/no write and exact supported retry; initial proposal creation is not idempotent and must not be blindly repeated.
5. Observe denied synthetic confidential workspace, current revocation and stale inspector clearing. Do not widen grants to make a test pass.
6. Inspect fresh receipt/audit export, actual health/degraded indexing and device enrollment/current scope. Exports are bounded observations, not the whole audit history.
7. Recover from malformed navigation and unknown outcomes without duplicate mutations; inspect1440/820/390px, keyboard/assistive technology and forced colors, including scanner-incomplete checks.

For each task record: exact revision/target/viewport, consented participant alias and role, timestamps, observed result, errors/confusion/manual assistance, screenshots with synthetic data only, and server receipt/evidence identifiers. Record failures honestly and retest corrected bytes. Automated fixture identities, screenshots and agent judgments cannot fill human result fields.

## Operational rollback and release decision

Before writes to staging, approve a destination/protection/retention policy for the staging backup and an evidence-preserving restore/recovery plan. The shipped recovery helper accepts only capabilities for disposable targets created by that process; it is NOT an existing-deployment backup tool. Do not fabricate an operational backup command from the local harness. Select a target-appropriate approved mechanism once the staging target is known; verify canonical events, decisions, versions, lineage and audit before/after restart/recovery. Never erase accepted evidence or overwrite a newer database with an old snapshot merely to roll back UI code. Stop further mutation on uncertainty, preserve data/receipts, and restore only into an explicitly owned compatible fresh target under approved authority.

Release acceptance requires exact hosted CI, deployed DOC-J01–07, actual independent human tasks/visual acceptance and operational recovery evidence, followed by final retrospectives. Historical intermittent recovery_startup_failed and transient browser graph unknown/timeouts have unproven causes; recent green runs are not causal repairs or production reliability claims.

## Scope remaining / sequencing boundary

Local core/device/operator behavior is exercised, not the whole roadmap.9.4/Epic9 cannot close from this packet. The catalog's6.5 exception is explicitly limited to that release-only gate; it does not silently waive9.4. Epic10 bounded Bumblebee/module work awaits the current9 closure/module-surface dependency and its own upstream/provenance gates. Epic11 experiments await9 curator acceptance and their own limits/provenance decisions. Neither is falsely reported implemented, optional-excluded, or product-adopted. Optional7 and deferred12–14 remain unadopted.

Next authorized action is Sabir's scoped staging/hosted/onboarding/participant decision, or a specific new Correct Course instruction permitting later dependency-ready LOCAL10/11 work while retaining9's release requirements. This is a consequential boundary, not an ordinary engineering question or independent developer-review gate.
