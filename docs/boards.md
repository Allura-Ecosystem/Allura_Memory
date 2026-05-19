# Allura Board Configs

> [!NOTE]
> **AI-Assisted Documentation**
> This document was drafted with AI assistance and should be checked against code,
> schemas, board state, and team consensus before being treated as canonical.

Phase 1 adds a config-driven board path so new boards can be introduced without
hardcoding private workflows into public source.

## Public Configs

Public, sanitized examples live in:

```text
src/lib/boards/examples.ts
```

Every board config must pass `BoardConfigSchema` from:

```text
src/lib/boards/schema.ts
```

Required declarations:

- `source`: the board's source of truth, owner, reference, and public/private posture.
- `writePolicy`: what actions are allowed and where audit evidence belongs.
- `evidencePolicy`: what proof is required before a card can be considered done.
- `degradedState`: what users see when the source cannot be loaded.
- `sections`: the lanes or panels rendered by `/boards/[boardId]`.

## Private Configs

Private or customer-specific configs must not be committed.

Use this local path for private drafts:

```text
board-configs/private/
```

That path is gitignored. If a private board needs a public example, create a
sanitized config with fake labels and no private URLs, names, customers, or
business data.

## Add A Board

1. Add a sanitized config to `src/lib/boards/examples.ts`.
2. Run the board config tests.
3. Open `/boards/<board-id>` locally and confirm the source, write policy,
   evidence policy, degraded state, and sections render honestly.
4. Attach validation evidence to the Work Board.
5. Log the outcome to Allura Brain with `group_id=allura-system`.

## Validation

Use the narrow tests first:

```bash
bun test src/lib/boards/__tests__/board-config.test.ts 'src/app/(main)/boards/[boardId]/page.test.tsx'
```

Run typecheck before calling the board route done:

```bash
bun run typecheck
```

## Phase 2 Presentation Slice

The current `/boards` pages derive presentation state from the existing registry data:

- The landing page adds a board switcher with derived status badges.
- Board detail pages show explicit source-of-truth, write policy, and evidence panels.
- The status model is derived from the current config sections instead of adding a new persisted schema field.
- The existing example boards remain the only public config data in this slice.
