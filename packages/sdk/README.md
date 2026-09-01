# @allura/sdk

Typed TypeScript client for the Allura Memory MCP gateway: governed memory
operations, deterministic scenario harness, and governed agent lanes.

The SDK speaks the Model Context Protocol over authenticated Streamable
HTTP. Authority is derived from the gateway-verified principal — the client
sends resource selectors, never authority claims.

## Install

```bash
bun add @allura/sdk
# or
npm install @allura/sdk
```

`zod` is bundled, so the package installs and type-checks offline.

## Usage

```ts
import { AlluraClient } from "@allura/sdk";

const client = new AlluraClient({
  baseUrl: "https://allura.example.com/mcp",
  token: process.env.ALLURA_TOKEN!,
});

// Governed memory
const search = await client.memory.search({
  query: "deployment policy",
  group_id: "allura-system",
});

// Deterministic harness
const run = await client.harness.run({
  scenario: "examples/engineering-review-agent/scenarios/success.json",
});
const replay = await client.harness.replay({
  scenario: "examples/engineering-review-agent/scenarios/success.json",
  receipt: run.receipt_path,
});

// Governed agent lanes (open → snapshot → review)
const lane = await client.lanes.open({
  group_id: "allura-system",
  lane_id: "agent-lane-woz",
  base_revision: "base-1",
});
const snapshot = await client.lanes.snapshot({
  ...laneArgs,
  diff: { added: [...], overridden: [], deleted: [] },
  evidence_refs: ["event:1"],
});
await client.lanes.review({
  ...laneArgs,
  snapshot_id: snapshot.snapshot_id,
  verdict: "approved",
  reason: "evidence verified",
});
```

## Surface

| Operation | Transport tool | Notes |
|---|---|---|
| `client.memory.*` | `memory_add` / `memory_search` / `memory_get` / `memory_list` / `memory_delete` | Governed memory with tenant scope |
| `client.harness.run / replay` | `scenario_run` / `scenario_replay` | Deterministic scenario execution and receipt comparison |
| `client.harness.eval / inspect` | `eval_run` / `evidence_inspect` | Evaluation runs and evidence listing |
| `client.lanes.open / snapshot / review` | `governed_lane_open` / `governed_lane_snapshot` / `governed_lane_review` | Durable, tenant-scoped agent lanes; review requires curator role |

## Package guarantees

- Dual-format build: ESM (`dist/index.js`) and CJS (`dist/index.cjs`).
- NodeNext declarations: `dist/index.d.ts` (import) and `dist/index.d.cts`
  (require).
- Zod request/response validation on lane operations — malformed gateway
  responses are rejected, not cast.
- Packed-tarball consumer tests verify `npm pack` → clean install →
  package-name resolution for both module systems, offline
  (`test/dist-consumer.test.ts`).

## Development

```bash
bun install
bun run build   # tsup: ESM + CJS + dts
bun test        # contract tests, envelope forwarding, packed-consumer proof
```