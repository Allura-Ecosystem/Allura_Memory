# Local development on Sabir's Dell

Start in `/home/sabira/homelab/START-HERE.md` or open Desktop → Homelab.

## Correct checkout and commands

Active development is `/home/sabira/Allura_Memory-beta-local`, branch `local/beta-machine-only` at cleanup. `Allura_Memory` is the primary reference checkout and owns shared Git metadata. `Allura_Memory-main` is the separate legacy local stack. Do not merge their unrelated migration histories or delete a linked worktree as a duplicate.

```sh
allura-dev --where
allura-dev run check
allura-dev run test:db
allura-dev run check:all
```

`--where` must print `/home/sabira/Allura_Memory-beta-local/foundation`. The installed command uses pinned Bun 1.3.14 and Node 24.19.0, reports the target branch, and refuses missing targets/tools and unknown commands. It is a checks-only convenience command, not an arbitrary Bun shell, server starter or deployment command. Run other explicitly authorized development commands directly in the checkout with the pinned toolchain.

`check` runs the strict non-DB test inventory, both TypeScript projects, and ESLint. `test:db` runs the strict PostgreSQL/browser/package lane in its own disposable container and removes that fixture. Keep Docker Desktop available in context `desktop-linux`. The test harness never falls back to a production database URL. `check:all` runs both. Do not weaken case/assertion discovery to obtain a green result.

## Source, data and runtime

- Current schema source: `foundation/migrations/001-*.sql` through `020-embedding-providers.sql`, ordered and checksum-bound by `foundation/src/persistence.ts`.
- Contracts: `_bmad-output/planning-artifacts/contracts/persistence-v1.md` and related current contracts. Historical dictionaries do not override the current schema.
- Packaged beta runtime: `/home/sabira/.local/share/allura-beta/releases/ram-0d69d8f9f9c1`; user service `allura-beta.service`; loopback port 6488.
- Current beta data: Docker volume `allura-beta-data`, separate from source. Never run broad volume pruning or restore over it as cleanup.
- Legacy schema: `Allura_Memory-main/docker/postgres-init/`. Its `71-mcp-authentication-lookup.sql` is not beta migration 021. Legacy data and Jeeves profile remain outside this cleanup's backup/change scope.

A source commit or passing suite does not deploy the packaged service. Human review/login, production acceptance, remote CI and unattended/reboot readiness remain separate gates. No remote push is part of this cleanup.

## Local tooling source and evidence

`tools/homelab/allura-dev` and `tools/homelab/test_allura_dev.py` preserve the Dell-specific installed wrapper and regression checks. The installed command is a separate executable copy at `/home/sabira/.local/bin/allura-dev`; update it only deliberately, not by switching branches. Verify:

```sh
python3 tools/homelab/test_allura_dev.py
cmp tools/homelab/allura-dev /home/sabira/.local/bin/allura-dev
```

Machine-specific reports and archived diagnostic logs live under `/home/sabira/.hermes/profiles/troy/reports/homelab-dev-ready/`, outside source. `_bmad/render/` is regenerable workflow output and ignored; authored `_bmad-output/` specifications remain versioned. No blanket ignore hides source changes.

For project changes, use the current `guidelines/ALLURA-BMAD.md` adapter and installed BMAD workflow. Preserve tenant/workspace/approval boundaries. Local verification is not operational work-status authority or semantic promotion.
