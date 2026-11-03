# Allura Memory development

`main` is the canonical development baseline, promoted from the GitHub `beta` rebuild at `29e79366e700f31ee7e363fdc41a9fa29897b26d` under Sabir's instruction. The promotion retains the old main history without incorporating the retired implementation into the new source tree. The old main tip is preserved as `archive/main-before-beta-20261103`.

This is a source-branch promotion, not evidence of a production deployment. No running service, database, credential, or public route is changed by this promotion. Keep the release checks described in the README open until actually verified.

## Prerequisites

Use the exact pinned toolchain: Bun 1.3.14 and Node.js 24.19.0. Do not change the version checks to accommodate a different system Node.

From the repository root:

```sh
cd foundation
bun run install:frozen
bun run check
```

`check` runs the required unit test cases, server and UI type checks, and lint. The frozen install disables package lifecycle scripts.

For all local checks, including isolated database and browser tests:

```sh
bun run check:all
```

For a clean committed checkout, use the authoritative exact-revision runner, which also prepares the pinned model and records lane logs and a receipt outside the repository:

```sh
bun run ci "$(git rev-parse HEAD)"
```

The full runner needs Docker, the pinned PostgreSQL image, native RuVector/model prerequisites, Playwright Chromium, and Linux Secret Service prerequisites. See `scripts/test-db.ts`, `scripts/prepare-model.ts`, and `../.github/workflows/allura-ci.yml`. Database tests create their own disposable resources; never substitute a live database URL.

## Local workstation

The canonical checkout on this workstation is `/home/sabira/Allura_Memory`. The local `allura-dev` shortcut selects this checkout and the installed pinned tools rather than changing the system-wide Node version:

```sh
allura-dev --where
allura-dev run check:toolchain
allura-dev run check
allura-dev run check:all
```

The separate `/home/sabira/Allura_Memory-beta-local` checkout contains newer, unpromoted work. It is preserved on `local/beta-machine-only`; do not merge it into main or label it verified merely because this baseline passed. The `/home/sabira/Allura_Memory-main` legacy checkout is also preserved and is not the canonical development directory.

## Working safely

Create scoped feature branches from current `main`, add relevant tests, and run checks before opening a pull request against `main`. Do not work directly in the running service's source or point tests at its database. Keep secrets and generated test evidence out of Git.

The `beta` branch is retained as a reference; it is no longer the default development target. Starting the service is a separate operation: follow `foundation/core-package/README.md` with an explicitly owned isolated instance. Passing local development checks does not prove production login, migration, or recovery readiness.
