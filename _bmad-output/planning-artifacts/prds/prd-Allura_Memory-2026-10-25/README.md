# Allura Memory PRD workspace

This is the repository-local BMAD PRD run folder resolved from the installed customization:

`_bmad-output/planning-artifacts/prds/prd-Allura_Memory-2026-10-25/`

## Current and historical artifacts

- [`prd.md`](./prd.md) — current **updated-draft-unapproved** PRD. It contains the authorized C01–C15 drafting corrections plus the bounded G01 classification correction; no item was decided or adopted.
- [`inputs/prd-before-update.md`](./inputs/prd-before-update.md) — byte-for-byte historical input copied from the former `_bmad-output/planning-artifacts/prd.md` before editing. SHA-256: `b1db0967a7ae36f1dd1e65469d85794c7fb0507e29743545270bffa38828d9c7`.
- [`prd-review-20261025T040936Z/`](./prd-review-20261025T040936Z/) — the existing nine-file review bundle moved intact from `_bmad-output/planning-artifacts/prd-review-20261025T040936Z/`. Every report/source hash is preserved in [`source-manifest.json`](./source-manifest.json).
- [`.memlog.md`](./.memlog.md) — append-only BMAD run memory initialized with explicitly labeled `RECOVERED` decisions plus the user's drafting/placement authorization. It is not product approval or work status.
- [`source-manifest.json`](./source-manifest.json) — binds the six canonical specifications, governing workflow/runtime documents, historical input, updated PRD, and moved review bytes.

## Historical citation note

The moved review files are immutable historical evidence. Their text still names the former PRD/review paths and the source state they reviewed. Relative `../prd.md` links now reach the updated draft because the review directory is a sibling of the current PRD; the actual reviewed bytes are `inputs/prd-before-update.md` at the hash above. The review bundle itself was not rewritten.

Inbound repairs outside this folder are limited to the PRD input path in `_bmad-output/planning-artifacts/epics.md` and the PRD links in the twelve active `_bmad-output/implementation-artifacts/stories/DEV-*.md` drafts. Each story edit replaces only the removed PRD path with the workspace PRD path; before/after hashes and exact-replacement verification are recorded in [`source-manifest.json`](./source-manifest.json) and [`correction-verification.json`](./correction-verification.json). No canonical document, schema, code, configuration, database, Notion record, Brain record, operational status, product decision, or acceptance state was changed. No addendum was created because no user-contributed downstream design material required one.
