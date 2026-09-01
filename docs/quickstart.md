# Allura Quickstart — Ten-Minute Developer Path

> Story 24.7 AC-6 / AC-7: a fresh clone can start the local stack, run one
> fixture-backed scenario, replay it, execute the portfolio eval suite, and
> inspect evidence by following this document. The ten-minute target is
> reported honestly in the [Timing](#timing) section.

## Prerequisites

- [Bun](https://bun.sh) v1.0+ (`bun --version`)
- Docker and Docker Compose (`docker compose version`)

## 1. Clone and install (≈2 min)

```bash
git clone https://github.com/Allura-Ecosystem/Allura_Memory.git
cd Allura_Memory
bun install
```

## 2. Initialize non-secret config (≈30 s)

```bash
bun packages/cli/src/index.ts init
```

This creates `.env.portfolio.example` with **non-secret** defaults. Edit it to
set your PostgreSQL password and MCP token secret. Secrets are never printed
after creation (AC-4).

> The CLI is also exposed as the `allura` bin via `packages/cli/package.json`.
> If you have linked the workspace (`bun link`), you can use `allura` directly;
> otherwise use `bun packages/cli/src/index.ts <command>`.

## 3. Start the local stack (≈2 min)

```bash
bun packages/cli/src/index.ts up
```

This runs `docker compose up -d` to start PostgreSQL and the Allura MCP server.

## 4. Verify your environment (≈1 min)

```bash
bun packages/cli/src/index.ts doctor
```

Checks runtime version, PostgreSQL readiness, migrations directory, and the MCP
gateway health endpoint. Exits non-zero if any check fails (AC-5). For
automation, add `--json` for stable machine-readable output (AC-8).

## 5. Run a fixture-backed scenario (≈1 min)

```bash
bun packages/cli/src/index.ts run tests/scenarios/governed-memory-success.yaml.json
```

## 6. Replay the scenario (≈1 min)

```bash
bun packages/cli/src/index.ts replay tests/scenarios/governed-memory-success.yaml.json receipt-*.json
```

## 7. Run the evaluation suite (≈1 min)

```bash
bun packages/cli/src/index.ts eval
```

## 8. Inspect evidence (≈30 s)

```bash
bun packages/cli/src/index.ts inspect
```

## 9. Stop the stack (≈30 s)

```bash
bun packages/cli/src/index.ts down
```

## Public contract evidence

The SDK exposes a stable public contract (AC-1 / AC-2). Verify it builds and
exports the documented surface:

```bash
cd packages/sdk
bun run typecheck   # tsc --noEmit
bun run build       # tsup → dist/index.js, dist/index.cjs, dist/index.d.ts
bun run test        # vitest — includes public-contract.test.ts
```

The `public-contract.test.ts` suite imports from the **public barrel**
(`src/index.ts`) and asserts the full documented surface — `AlluraClient`,
`MemoryOperations`, all error classes, auth helpers, utilities, and versioned
Zod schemas — without importing server internals.

The smallest supported integration lives in `examples/quickstart/`:

```bash
bun run examples/quickstart/index.ts
```

## Compatibility Matrix

See [docs/reference/compatibility.md](reference/compatibility.md) for the
version/deprecation matrix (AC-9).

| Component | Version | Status |
|-----------|---------|--------|
| @allura/cli | 1.0.0 | Stable |
| @allura/sdk | 1.0.0 | Stable |
| API Schema | v1 | Stable |
| Scenario Schema | v1 | Stable |
| Evaluation Result Schema | v1 | Stable |

## Timing

The ten-minute target assumes a warm Docker image cache and a machine with
network access. The steps above total roughly **9–10 minutes** of active
commands. A clean-environment transcript with actual elapsed time, machine
profile, and any failures encountered is recorded in the story evidence
(AC-7).

## Dashboard demo path

The governed operator dashboard is a separate, loopback-only demo surface. It
uses the same PostgreSQL stack but a collision-safe host port and a foreground
Next.js server.

### 1. Initialize the portfolio environment (≈30 s)

`bun run portfolio:up` creates the ignored `.env.portfolio` from the checked-in
non-secret local-demo example when it is absent. It never prints environment
values. You may copy and edit the example first if you need a different local
port.

### 2. Start the portfolio database (≈1 min)

```bash
bun run portfolio:up
```

This starts only a disposable PostgreSQL container on
`127.0.0.1:${PORTFOLIO_POSTGRES_PORT:-5433}`. It has no named or host-mounted
volumes: its schema and synthetic workspace fixture are copied into the image
at build time. Each `portfolio:up` force-recreates it, so do not use it for
data you need to keep.

### 3. Start the dashboard in a separate terminal

```bash
bun run portfolio:dev
```

### 4. Verify the demo path

```bash
bun run dashboard:doctor
```

The doctor requires app-role connectivity, RLS isolation, and HTTP 200 on all
seven mapped routes. It exits non-zero on any failure.

The registered real-process HTTP/auth contract can also be run independently:

```bash
bun run test:dashboard-http
```

It creates its own disposable portfolio database and isolated local ports. It
starts Next twice: once with explicit DevAuth and once with DevAuth disabled.

### 5. Capture browser evidence

```bash
bun run dashboard:browser
```

This emits seven PNGs plus a `manifest.json` under
`artifacts/dashboard-demo/`. A redirect, page error, console error, or 404
fails the run and produces no image for that route.

### 6. Stop the portfolio database

```bash
bun run portfolio:down
```
