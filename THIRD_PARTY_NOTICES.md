# Third-Party Notices

This project may use or adapt the following third-party software. Copied or
substantial portions of such software retain their original license notices.

## RuVector

- **Source:** https://github.com/ruvnet/RuVector
- **License:** MIT
- **Copyright:** Copyright (c) 2025 rUv
- **Use in Allura:** Optional retrieval/search acceleration via
  `packages/ruvector-adapter`, plus architecture inspiration. RuVector accelerates
  vector search; Allura retains ownership of tenancy (`group_id`/`workspace_id`),
  HITL promotion, `SUPERSEDES` versioning, and audit (see
  `docs/allura-hosted/RISKS-AND-DECISIONS.md` AD-09 and governed canon ADR-003).
- **Notes:** All copied or modified source files must retain the MIT license
  notice. Full license text: [`LICENSES/ruvector-MIT.txt`](./LICENSES/ruvector-MIT.txt).
