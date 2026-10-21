# Claim and source map

AI-Assisted Documentation: inspection, 2026-10-20. Base commit `28d90e843` plus existing working edits. These sources establish intended concepts and source-inspected behavior; they do not establish current deployment or a passed end-to-end test.

| Explanation | Claim supported | Source | Boundary |
|---|---|---|---|
| Remember a decision | Connected agents submit context and later search; returned evidence should be inspected | [Blueprint memory scope](../../allura/BLUEPRINT.md#documentation-repair-scope--2026-10-18), [bounded data contract](../../allura/DATA-DICTIONARY.md#bounded-memory-journey-data-contract) | The PostgreSQL content is an illustrative fixture; no successful live save/search claimed |
| Remember a decision | Approved-only search differs from all-evidence search | `src/mcp/canonical-tools.ts`, `memory_search` retrievalStatus/approved branch | The actual guide/runner owns request parameters; the drawing does not promise a particular record is returned |
| Who does what | Agent submits; service stores/retrieves; operator maintains; independent human reviews | [Blueprint audience/boundary](../../allura/BLUEPRINT.md#documentation-repair-scope--2026-10-18), [governed write path](../../allura/SOLUTION-ARCHITECTURE.md#34-governed-memory-write-path) | No automatic capture or default configured integration is implied |
| Saved versus approved | Evidence, proposals, approved versions and receipts have separate identities/states | [Data Dictionary](../../allura/DATA-DICTIONARY.md#bounded-memory-journey-data-contract), [curator state machine](../../allura/DESIGN-ALLURA.md#curator-pipeline-state-machine) | Intended policy; unresolved implementation and verification gaps remain |
| Saved versus approved | Scores alone do not authorize promotion; rejected evidence is not approved knowledge | `src/mcp/canonical-tools.ts` human-approval queue, [proposal states](../../allura/DATA-DICTIONARY.md#postgresql-canonical_proposals) | No claim that all current paths implement every invariant |
| All | Exact current visual identity and task-specific educational scope | [strategy receipt](../../reference/reddit-remediation/strategy-receipt.md), installed `allura-brand` approved 2026-08-15 reference | No new market positioning, Strategy Pack lock, UI reference, client affiliation, or publication approval |

The captions deliberately avoid fake checkmarks, shields or observed-state badges. Orange identifies review/decision structure, Blue identifies saved/context work, Green identifies the approved-knowledge concept, and Ink labels every meaning in text. Color does not establish authority.

## Production dependencies

- Generator: [build.mjs](build.mjs). SVG XML plus installed `sharp` renders; no AI raster generation or text recreation.
- Context7: `/lovell/sharp`; queried SVG Buffer constructor, PNG `toFile`, and `resize` on 2026-10-20. Official documentation confirmed supported SVG input, chained PNG output and resize width.
- Wordmark: repository `public/readme/allura-wordmark.png`, copied byte-for-byte to `assets/allura-wordmark-original.png`. SHA-256 recorded in [manifest](manifest.json). The displayed lockup removes transparent padding only, preserving visible source pixels and aspect ratio.
- Typography: Noto Sans fallback because `fc-match Aeonik` resolved to Noto Sans; no unavailable-font claim.
- Palette: Cream `#F7F3EE`, Ink `#0F1720`, Blue `#0D47A1`, Orange `#FF4D1F`, Green `#148A4B`. Body and headings use Ink for contrast; colored outlines carry supplemental semantics.

## Open gates

Independent QA may still require revision. The actual first-use demonstration, human-review exercise, clean-install verification, five-person study and publication receipts are not supplied by these image files.
