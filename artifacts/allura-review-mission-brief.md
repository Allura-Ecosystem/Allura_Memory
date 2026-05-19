# /allura Runtime Trust Mission Brief

Date: 2026-05-16
Owner: Gilliam
Route: `/allura`
Status: In Review, not Done

## Source Of Truth
- Brand authority: `DESIGN.md`
- Functional route parity: `docs/allura/DESIGN-ALLURA.md` F41/F42
- Requirements: `docs/allura/REQUIREMENTS-MATRIX.md` F41/F42 and DASH-UC2
- Harness/board contract: `.opencode/AGENTS.md`, `.opencode/config.json`, `.opencode/manifest.json`

## Current Verified State
- Active checkout: `/media/ronin704/Games/Projects/ai-agents/allura-memory`
- Clean preview target: `localhost:3334/allura`
- Existing dev process found: `bun run dev` / `next-server` from this checkout.
- Board/harness state declares `/allura brand alignment / 6420 parity cleanup` as In Review.

## Mission
Make `/allura` trustworthy in browser: on-brand, clean runtime, interactive, responsive, honest about degraded memory/Neo4j data, and validated before Done.

## Review Gates
- Pike-style review: interface clarity, source-of-truth language, keyboard tab behavior, search label, no fabricated data claims.
- Fowler-style review: maintainability, token use, component size, brittle code, date tolerance.
- IRIS review: brand/product feel, responsive layout, visible focus, IBM Plex Sans, no generic SaaS styling.
- TALON review: runtime health, benchmark commands, browser smoke, production preview.

## Hard Rules
- Do not move Kanban card to Done unless browser smoke, Pike/Fowler, Ralph validation, evidence logging, Notion evidence, and Allura Brain writeback pass.
- Do not fabricate memory counts, graph nodes, approval data, or reviewer approval.
- Do not treat normal Next dev HMR noise as a blocker.
- Fix blockers only; preserve unrelated dirty work.

## Required Evidence
- `bash .opencode/scripts/validate-oac-core.sh`
- `bun scripts/validate-codex-governance-gate.ts`
- `bunx eslint src/app/'(main)'/allura/page.tsx`
- `bun run typecheck`
- `bun test src/lib/dashboard/__tests__/allura-route.test.ts src/__tests__/dashboard-schemas.test.ts`
- `bun run build`
- Browser smoke at 1440, 1280, 768, 375 with no horizontal overflow.
- Tabs count 6; ArrowRight from Memories focuses/selects Insights; Home/End work.
- Screenshot refreshed: `artifacts/allura-after-3334.png`
