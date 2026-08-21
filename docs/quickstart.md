# Allura Quickstart

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Docker and Docker Compose

## 1. Clone and initialize

```bash
git clone https://github.com/Allura-Ecosystem/Allura_Memory.git
cd Allura_Memory
bun install
allura init
```

This creates `.env.portfolio.example` with non-secret defaults. Edit it to set
your PostgreSQL password and MCP token secret.

## 2. Start the local stack

```bash
allura up
```

This starts PostgreSQL and the Allura MCP server via Docker Compose.

## 3. Verify your environment

```bash
allura doctor
```

Checks runtime versions, port availability, database readiness, migrations,
and write/read round-trip.

## 4. Run a fixture-backed scenario

```bash
allura run tests/scenarios/governed-memory-success.yaml.json
```

## 5. Replay the scenario

```bash
allura replay tests/scenarios/governed-memory-success.yaml.json receipt-*.json
```

## 6. Run the evaluation suite

```bash
allura eval
```

## 7. Inspect evidence

```bash
allura inspect
```

## 8. Stop the stack

```bash
allura down
```

## Compatibility Matrix

| Component | Version |
|-----------|---------|
| CLI | 1.0.0 |
| SDK | 1.0.0 |
| API Schema | v1 |
| Scenario Schema | v1 |
| Evaluation Schema | v1 |