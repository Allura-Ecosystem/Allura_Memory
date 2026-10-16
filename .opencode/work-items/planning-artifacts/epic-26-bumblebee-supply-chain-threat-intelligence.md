# Epic 26 — Bumblebee Plugin Supply-Chain Inventory & Governed Response

> [!NOTE]
> **AI-Assisted Documentation**
> This corrected plan was prepared with AI assistance and must remain aligned with upstream Bumblebee and repository authority.
>
> [!IMPORTANT]
> **Correct Course — 2026-08-27**
> The intended Bumblebee is the upstream `perplexityai/bumblebee` endpoint scanner. Allura integrates it as a governed plugin. Existing Stories 26.1–26.6 are useful Allura-native downstream workflow slices, but they do not prove upstream scanner integration. See [the Correct Course decision](epic-26-correct-course-upstream-bumblebee-plugin.md).

**Status:** In Progress — Correct Course accepted; Story 26.7 implementation has begun on its dedicated upstream-plugin branch, while the scanner ingestion path remains incomplete.
**Owner:** Brooks (architecture); Woz (implementation); Pike/Fowler/Knuth (review).
**Tenant:** `allura-system`
**Canonical source pin:** `perplexityai/bumblebee` tag `v0.1.2`, commit `cc57710eeaf685e7b89924a36c8583cad0a378fe`, emitted schema `0.1.0`

## Goal

Ship a governed Allura plugin around a pinned upstream Bumblebee scanner. The scanner reads approved developer-endpoint metadata and emits NDJSON snapshots. The plugin authenticates the endpoint, binds it to a server-owned tenant/workspace/source, stores durable evidence, promotes only complete snapshots, and hands accepted inventory to Allura’s exposure and governed-response services.

## Product boundary

Bumblebee is a **read-only endpoint inventory scanner plus an Allura integration plugin**.

```text
upstream scanner
→ Allura plugin receiver
→ accepted snapshot/current inventory
→ exposure and alert services
→ simulated proposal and optional host response
→ optional Curator display
```

The scanner is not antivirus, EDR, a firewall, a package installer, an arbitrary-code runner, a scheduler, a dashboard, or policy authority. The plugin does not trust tenant/workspace claims from the body, query, headers, hostname, or device record. The optional dashboard does not own ingestion or endpoint authority.

## Ownership

### Upstream scanner

- One-shot `baseline`, `project`, and `deep` scans
- Supported lockfile/package-manager, extension, MCP-config, Homebrew, and locked agent-skill metadata
- Stable `record_id`, per-run `run_id`, package/finding/summary NDJSON
- Self-test and stdout/file/HTTP sinks
- Optional exact package-presence findings against an operator-supplied catalog

### Allura Bumblebee plugin

- Pin/checksum/license/schema compatibility for the upstream build and its reviewed ecosystem allowlist
- Server-issued source/population revision and monotonic scan lease
- Endpoint enrollment and credential-bound source identity
- Separate long-lived `bumblebee_runner` and short-lived lease `bumblebee_ingest` audiences, plus HTTPS-only production transport
- Authenticated, bounded, atomic NDJSON ingestion
- Server-owned tenant/workspace binding
- Sanitized append-only record evidence, raw body/line hashes, batch receipts, and run-promotion receipts
- Complete-snapshot current-state projection, profile separation, idempotency, and staleness
- Handoff to Allura inventory, enriched matcher, alert, and simulated-proposal services
- Optional read-only Curator module descriptor/display

### Canonical Allura host services

- Advisory polling and catalog governance
- Enriched matching beyond upstream exact package presence
- Alert dedupe, simulated mitigation drafts, approval gates, response connectors, and immutable receipts

These are downstream Allura powers. They are not powers of the upstream scanner.

## V1 authority

Automatic V1 authority stops at accepted inventory, verified exposure evidence, a deduplicated alert, and a simulated proposal. Policy activation, package/CI blocking, credential revocation, workspace locking, endpoint isolation, response execution, and schedule changes require separate canonical Allura authorization and receipts.

## In scope

- Pinned upstream scanner provenance, compatibility contract, and real binary self-test/scan
- Separate runner/lease Bearer audiences that cannot authenticate to each other's route or MCP/browser surfaces
- Server-issued monotonic run lease bound to profile, mode, root/config digest, ecosystem allowlist, all-users setting, and optional catalog digest
- Credential-bound tenant/workspace/source/device/profile authority
- HTTPS-only production transport, trusted-proxy scheme checks, full-batch atomic acceptance, gzip after authentication, and strict size/record limits
- Upstream package/finding/`scan_summary` conformance and schema-version policy
- Append-only sanitized records with redaction provenance and immutable acceptance/promotion receipts
- Complete/partial/error/missing-summary promotion matrix
- Routine `baseline`/`project` state, campaign `deep` evidence, staleness, replay, and late-record behavior
- Separation of upstream exact package findings from Allura enriched matching
- Headless endpoint scan → ingestion → current inventory → exposure retrieval proof

## Explicit exclusions

- Reimplementing upstream-supported scanner parsers as the primary integration
- Browser-derived or payload-derived tenant/workspace authorization
- Direct `/dashboard/bumblebee` route
- Dashboard/module registry as scanner transport authority
- Silent policy activation or autonomous response
- Background retry/spooling claims for the upstream binary
- Treating partial/error/missing-summary runs as current or clean
- Calling hash/workflow/publisher/indicator correlation an upstream Bumblebee finding

## Story map

| Story | Preserved outcome                                                                 | Correct Course status                                                                                            |
| ----- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 26.1  | Trust, source, and V1 authority boundary                                          | Done as Allura-native foundation; corrected plugin boundary is recorded here and in the Correct Course decision. |
| 26.2  | Normalized Allura inventory and adjunct local parsers                             | Done as foundation; does not prove upstream scanning or snapshot ingestion.                                      |
| 26.3  | Allura enriched exposure matcher and threat fixtures                              | Done as downstream enrichment; upstream exact findings remain a separate provenance lane.                        |
| 26.4  | Allura advisory polling and alert routing                                         | Done as downstream worker; not an endpoint scanner scheduler.                                                    |
| 26.5  | Governed simulated mitigation proposals                                           | Done as downstream host service.                                                                                 |
| 26.6  | Optional canonical host response handoff and receipts                             | Done as downstream/optional host response; not a Bumblebee V1 dependency.                                        |
| 26.7  | Upstream Bumblebee plugin integration, adversarial conformance, and headless demo | **In Progress — bounded provenance/schema-contract work started; all acceptance criteria remain open.**          |

## Epic acceptance criteria

- [ ] The plugin pins and attests a reviewed upstream Bumblebee release/commit and schema compatibility contract.
- [ ] A real upstream binary passes self-test and a representative endpoint scan.
- [ ] Separate runner/lease credentials and a server-issued scan lease bind source/device/population/profile/catalog revision to tenant/workspace server-side.
- [ ] NDJSON batches use HTTPS outside isolated loopback tests and are authenticated, bounded, validated, accepted atomically, redacted, and receipted durably.
- [ ] Only eligible complete snapshots promote current routine inventory; empty complete is valid, while partial/error/missing-summary/deep/findings-only runs cannot retire routine state.
- [ ] Duplicate, late, stale, malformed, mixed-run, conflicting-replay, forged-population, future-clock, and cross-tenant cases are proven safe using server-owned generation ordering.
- [ ] Upstream exact package findings and Allura enriched matches retain distinct provenance and authority.
- [ ] Automatic behavior stops at alert plus simulated proposal; response remains separately governed.
- [ ] A headless demo proves scanner → plugin → current inventory → exposure retrieval on the frozen candidate.
- [ ] Independent review and current-SHA remote CI pass before Epic completion.

## Dependencies

- Epic 24 identity, app-role scope, audit, and mutation-boundary foundations
- Dedicated hashed/revocable runner and lease credential audiences with no MCP/browser authority
- Fresh PostgreSQL migration and RLS/immutability proof for plugin source, sanitized record, batch receipt, and run-decision contracts
- Upstream schema compatibility decision, including known code/schema enum drift

Story 25.3b is useful optional display infrastructure but is **not** an Epic 26 headless scanner-integration dependency.

## Evidence sources

- [Correct Course decision](epic-26-correct-course-upstream-bumblebee-plugin.md)
- [Pinned upstream Bumblebee tree](https://github.com/perplexityai/bumblebee/tree/cc57710eeaf685e7b89924a36c8583cad0a378fe)
- [Pinned upstream transport contract](https://github.com/perplexityai/bumblebee/blob/cc57710eeaf685e7b89924a36c8583cad0a378fe/docs/transport.md)
- [Pinned upstream state model](https://github.com/perplexityai/bumblebee/blob/cc57710eeaf685e7b89924a36c8583cad0a378fe/docs/state-model.md)
- [Allura Risks and Decisions](../../../docs/allura/RISKS-AND-DECISIONS.md)

## Ownership

- **Architecture:** Brooks
- **Endpoint/source authority:** Knuth + security owner
- **Implementation:** Woz
- **Interface/optional display:** Pike
- **Acceptance:** Fowler
