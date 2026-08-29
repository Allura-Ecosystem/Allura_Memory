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
The scenario harness records checkpoint transitions. If the process were
interrupted, it would resume from the last checkpoint without repeating
side effects.

### 7. Deterministic replay
```bash
allura replay tests/scenarios/governed-memory-success.yaml.json receipt-*.json
```
**Expected**: Replay identical: true, no divergent fields.

### 8. Evaluation comparison
```bash
allura eval
```
**Expected**: All 8 evaluation tests pass, overall status: pass.

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