---
title: '3.1 Capture operation identity and AD-65 disposition'
status: done
created: 2026-10-26
baseline_commit: 546bd1d69038b31a0e3c23e1bc977d5a7c622b78
---

# Intent and acceptance

Resolve AD-65 before storage implementation, using delegated design authority rather than waiting for independent review. `planning-artifacts/contracts/capture-v1.md` supplies exact request/default/metadata limits, operation namespace and canonical digest, atomic four-record transaction, immutable stage receipt, admission/replay distinction, no retention deletion, bounded worker handoff and explicitly local new-version compatibility. Owners named there are responsibility assignments, not claims those historical people or separate agents reviewed anything.

Self-check against `docs/allura/DESIGN-ALLURA.md:1057–1080`, `RISKS-AND-DECISIONS.md:568–576`, authority-v1 and persistence-v1: current authorization before replay; no new public capture endpoint; stable key; no content-only dedup; unchanged input bytes; exact same-key receipt; separate indexing/proposal/promotion; no old-client rollout; no production adoption. No unresolved local field prevents 3.2. Live consumer inventory/release permission remains 6.2, not a reason to fabricate compatibility. Worker/model processing remains 5.1 and must use the declared finite policy.

This story is contract acceptance, not a functioning capture claim. Story 3.2 must now implement and exercise it. No independent development review occurred; product human promotion gate remains unchanged.
