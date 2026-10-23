# Command Center prototype handoff

For developers reviewing a historical HTML/CSS design export. This bundle is a prototype reference, not implementation instructions, current product acceptance, or evidence of a working dashboard.

**Next step:** compare the available files in this directory with the exact approved design revision for the story being implemented. The prior export's assertion that one file was open does not establish current user intent.

Use the current [Design document](../../allura/DESIGN-ALLURA.md) and [open decisions](../../allura/RISKS-AND-DECISIONS.md) to establish scope and visual authority. Inspect both source and rendered behavior when evaluating a prototype; dimensions in source do not prove the actual result.

For the memory service's first-use task, use [Getting started](../../user-guide/getting-started.md). The [remediation brief](../../reference/reddit-remediation/brief.md) explains why the memory journey and a portfolio dashboard specimen have separate purposes.

The two historical generated JavaScript exports are preserved byte-for-byte and classified separately from maintained source lint. Every package lint entrypoint first runs `validate:generated-exports`: it verifies the exact inventory in `scripts/ci/historical-generated-exports.json`, compiles the scripts without executing them, checks the pinned HTML consumer and refuses additional scripts. Other source lint rules remain unchanged. No matching generator was recovered within the inspected local provenance scope; this classification does not claim reproducible regeneration.

An integrity failure requires restoring unintended changes or independently reviewing recovered source, regenerated output and the inventory update. Never refresh hashes automatically or broaden the exception. Parsing and integrity do not prove rendering: the historical browser smoke is separate and requires the export's SRI-pinned React 18.3.1 dependencies. Neither check establishes current product acceptance.

*AI-Assisted Documentation: editorial revision, 2026-10-20. Original design-export provenance retained; no new design approval is asserted.*
