# Allura Demo Script

## Prerequisites
- Bun v1.0+
- Docker and Docker Compose
- Clean clone of Allura_Memory

## Demo Flow

### 1. Start the stack
```bash
allura init
allura up
allura doctor
```

### 2. Run a governed memory scenario
```bash
allura run tests/scenarios/governed-memory-success.yaml.json
```
**Expected**: Scenario completes successfully, receipt written.

### 2b. Run a reference integration (Story 24.9)
```bash
allura run examples/engineering-review-agent/scenarios/success.json
allura run examples/controlled-research-agent/scenarios/success.json
allura run examples/regulated-document-quality/scenarios/success.json
```
**Expected**: Each completes; receipts written with scenario digest, definition
revision, principal/tenant references, and evidence hashes.

### 3. Demonstrate policy denial
```bash
allura run tests/scenarios/unauthorized-cross-tenant-access.yaml.json
```
**Expected**: Scenario fails with TENANT_MISMATCH, policy decision recorded.

### 4. Demonstrate human-governed promotion
```bash
allura run tests/scenarios/governed-memory-success.yaml.json
```
**Explain**: The scenario shows a curator approving a proposal. In production,
this is an atomic PostgreSQL transaction — canonical memory, proposal decision,
audit event, and outbox event all commit together or roll back together.

### 5. Inject a failure
```bash
allura run tests/scenarios/checkpoint-recovery-after-failure.yaml.json
```
**Expected**: TRANSIENT_RETRY error occurs, runner retries, scenario completes.

### 6. Checkpoint resume
The scenario harness records checkpoint transitions. To demonstrate resume
from a checkpoint, run the recovery scenario and inspect its receipt:

```bash
allura run examples/engineering-review-agent/scenarios/recovery.json
```
**Expected**: TRANSIENT_RETRY occurs, the runner retries within the step, and
the scenario completes. The receipt's `checkpoint_transitions` array shows the
step sequence; `side_effect_keys` proves no side effect is repeated.

### 7. Deterministic replay
```bash
allura replay tests/scenarios/governed-memory-success.yaml.json receipt-*.json
```
**Expected**: Replay identical: true, no divergent fields.

### 8. Evaluation comparison
```bash
allura eval
```
**Expected**: All 9 portfolio evaluation lanes pass, overall status: pass.

### 9. Audit inspection
```bash
allura inspect
```
**Expected**: Evidence artifacts listed with hashes.

## Key Points
- All operations are tenant-isolated via PostgreSQL RLS
- All audit events are append-only (immutable)
- All promotions require human approval (HITL)
- All scenarios are deterministic and replayable
## Dashboard walkthrough

The governed operator dashboard demonstrates server-owned scope and truthful
live/empty/degraded states over the PostgreSQL/RuVector stack.

### 1. Start the portfolio database
`bun run portfolio:up` creates `.env.portfolio` from the non-secret local-demo
example if needed, without printing environment values.

```bash
bun run portfolio:up
```

The portfolio database is explicitly disposable: the compose file declares no
named or host volumes, while the image copies its initializer and synthetic
workspace fixture at build time. `portfolio:up` recreates the container; use a
different database for persistent work.

### 2. Start the dashboard (separate terminal)
```bash
bun run portfolio:dev
```

### 3. Verify the demo path
```bash
bun run dashboard:doctor
```
**Expected**: app-role connectivity, RLS isolation, and HTTP 200 on all seven
routes.

### 3b. Run the local HTTP/auth contract
```bash
bun run test:dashboard-http
```
**Expected**: a disposable supported PostgreSQL database and isolated Next
processes prove all seven routes are 200 without redirects under explicit
DevAuth, then redirect or deny every protected route with DevAuth disabled.

### 4. Capture evidence
```bash
bun run dashboard:browser
```
**Expected**: seven PNGs and a `manifest.json` under `artifacts/dashboard-demo/`,
with no image emitted for any failed route.

### 5. Stop the portfolio database
```bash
bun run portfolio:down
```

## Key Points
- All operations are tenant-isolated via PostgreSQL RLS
- All audit events are append-only (immutable)
- All promotions require human approval (HITL)
- All scenarios are deterministic and replayable
- Dashboard scope is server-derived; browser `x-allura-*` headers are never authority
