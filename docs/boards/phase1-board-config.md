# Phase 1 Board Config Slice

This repository slice introduces a small, safe board config system:

- A Zod-backed board config schema.
- An in-memory registry with id and route lookup.
- Sanitized example boards.
- A `/boards` landing page and `/boards/[boardId]` route.
- Focused tests for validation and route resolution.

## Config contract

Every board config must declare:

- `id`
- `title`
- `summary`
- `adapter`
- `source`
- `writePolicy`
- `evidencePolicy`
- `degradedState`
- `sections`

The loader rejects invalid ids, duplicate ids, duplicate routes, and malformed configs before they enter the registry.

## Adding a board

1. Add a new board object to `src/lib/boards/examples.ts`, or feed a future private config through the registry loader.
2. Keep the board id slugged, for example `ops-board` or `governance-board`.
3. Confirm the generated route `/boards/<id>` resolves through the registry.
4. Declare the source of truth and write policy explicitly.
5. Keep example content sanitized. Do not use private customer names, secrets, or real operational data.
6. Add or update a registry test in `src/lib/boards/__tests__/board-registry.test.ts`.
7. Add or update a route-loading test in `src/lib/boards/__tests__/board-route.test.ts`.

## Private configs

Private board configs should live outside the shared example set and be gitignored by the project owner. Use the local-only `board-configs/private/` directory.

## Current slice

The bundled examples intentionally stay small:

- `memory-ops`
- `agent-readiness`

They are enough to prove the schema, registry, example seeding, and dynamic route behavior without exposing private business state.
