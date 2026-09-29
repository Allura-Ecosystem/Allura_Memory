<!-- Context: core/testing | Priority: critical | Version: 1.0 | Updated: 2026-05-03 -->

---
owner: scout
last_verified: 2026-05-03
source_files:
  - __tests__/
  - tests/
  - benchmark/
  - scripts/test-brain-integration.sh
max_age_days: 30
---

# Allura Memory — Testing Standards

## Test Structure
- **Unit tests:** `src/__tests__/` adjacent to source files
- **E2E tests:** `tests/` directory (29/29 passing as of 2026-05-01)
- **Benchmarks:** `benchmark/` directory
- **Integration:** `scripts/test-brain-integration.sh` — validates Brain connectivity

## Test Commands
```bash
bun test                    # Run all unit tests
bun test tests/e2e/         # Run E2E tests
bash scripts/test-brain-integration.sh  # Validate Brain integration
```

## Coverage Targets
- Unit test coverage: per-module (check with `bun test --coverage`)
- E2E: 29/29 passing
- Integration: Brain tools (add/search/list/get/promote/update/delete/export)
- Retrieval benchmark: P@5 = 0.867
- UX benchmark: 0.881

## What to Test
1. **Brain tools** — every `allura-brain__*` tool must round-trip correctly
2. **RuVix enforcement** — POL-001 through POL-006 must block violations
3. **Promotion pipeline** — curator events, HITL approval, semantic-layer write
4. **Vector search** — embedding dimensionality (1024d), HNSW index validity
5. **Budget enforcement** — BudgetEnforcer must halt on breach
6. **Zod validation** — all API boundary schemas must reject invalid input
7. **Context gate** — Scout context must load before build tasks

## Test Invariants
- Every `memory_add` must produce a traceable PG row
- Every `memory_promote` must produce a proposal ID
- Every `memory_search` must return results with `score` field
- Empty context folders must fail validation (R5 gate)
- Ralph must refuse execution without Scout + skill gate