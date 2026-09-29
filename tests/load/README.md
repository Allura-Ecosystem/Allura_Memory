# Allura Memory — k6 Load Test

> Phase 9 benchmark: `memory_add` end-to-end latency < 200ms p95 at 100 concurrent agents.

## Overview

This directory contains k6 load tests for the Allura Memory MCP HTTP gateway. The tests validate performance, reliability, and correctness under load across all major endpoints.

## Prerequisites

### Install k6

```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD1C83800A8B11
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6:latest

# Windows
choco install k6
```

### Start the Server

```bash
# Start the MCP HTTP gateway
bun run mcp:http

# Or with custom port and auth
ALLURA_MCP_HTTP_PORT=3201 ALLURA_MCP_AUTH_TOKEN=your-token bun run mcp:http
```

## Running Tests

### Quick Start

```bash
bun run load-test
```

### Manual Execution

```bash
# Default (localhost:3201, no auth)
k6 run tests/load/k6-load-test.js

# Custom base URL
BASE_URL=http://remote:3201 k6 run tests/load/k6-load-test.js

# With authentication
ALLURA_MCP_AUTH_TOKEN=your-token k6 run tests/load/k6-load-test.js

# Both
BASE_URL=http://remote:3201 ALLURA_MCP_AUTH_TOKEN=your-token \
  k6 run tests/load/k6-load-test.js

# Using the runner script
bash tests/load/run-load-test.sh

# With environment variables
BASE_URL=http://remote:3201 ALLURA_MCP_AUTH_TOKEN=your-token bash tests/load/run-load-test.sh
```

### Docker Execution

```bash
docker run --rm --network host \
  -e BASE_URL=http://host.docker.internal:3201 \
  -e ALLURA_MCP_AUTH_TOKEN=your-token \
  grafana/k6:latest run \
  - <tests/load/k6-load-test.js
```

## Test Scenarios

### Smoke Test

- **1 VU**, 1 iteration
- Validates all endpoints are reachable
- Quick sanity check before running the full load test

### Load Test

Ramping VUs over 3 minutes:

| Stage | Duration | Target VUs |
|-------|----------|------------|
| Ramp up | 30s | 20 |
| Ramp up | 30s | 50 |
| Ramp up | 30s | 100 |
| Sustain | 60s | 100 |
| Ramp down | 30s | 0 |

**Total duration:** ~3 minutes

## Thresholds

| Metric | Threshold | Purpose |
|--------|-----------|---------|
| `memory_add_duration` | p95 < 200ms | **Phase 9 benchmark** — primary target |
| `memory_add_duration` | avg < 100ms | Average latency target |
| `memory_search_duration` | p95 < 500ms | Search performance |
| `http_req_duration` | p95 < 500ms | General HTTP latency |
| `errors` | rate < 5% | Error tolerance |

If any threshold is violated, k6 exits with a non-zero code, failing CI pipelines.

## Endpoints Tested

| Endpoint | Method | Description | Frequency |
|----------|--------|-------------|-----------|
| `/health` | GET | Health check | Every iteration |
| `/api/live` | GET | Liveness probe | Every iteration |
| `/api/ready` | GET | Readiness probe | Every 5th iteration |
| `/api/metrics` | GET | Prometheus metrics | Every 10th iteration |
| `/mcp` (memory_add tools/call) | POST | Add memory | Every iteration |
| `/mcp` (memory_search tools/call) | POST | Search memories | Every iteration |
| `/mcp` (memory_get tools/call) | POST | Get memory by ID | Every iteration |
| `/mcp` (memory_list tools/call) | POST | List memories | Every iteration |
| `/mcp` (initialize) | POST | MCP session init | Every 3rd iteration |
| `/mcp` (tools/call) | POST | MCP tool call | Every 3rd iteration |
| `/api/curator/proposals` | GET | List proposals | Every 10th iteration |

## Custom Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `memory_add_duration` | Trend | End-to-end latency for memory_add (Phase 9 target) |
| `memory_search_duration` | Trend | End-to-end latency for memory_search |
| `memory_get_duration` | Trend | End-to-end latency for memory_get |
| `memory_list_duration` | Trend | End-to-end latency for memory_list |
| `mcp_request_duration` | Trend | Latency for MCP Streamable HTTP requests |
| `errors` | Rate | Error rate across all requests |
| `requests_total` | Counter | Total number of requests made |

## Interpreting Results

### k6 Output

k6 produces detailed output including:

- **Iteration metrics**: Requests per second, iteration duration
- **HTTP metrics**: Request duration (avg, p95, p99), request rate
- **Custom metrics**: Our Phase 9 benchmark metrics
- **Threshold results**: PASS/FAIL for each threshold

### Results Files

After each run, results are saved to `tests/load/results/`:

```
results/
├── summary-20260413-120000.json    # k6 JSON summary
├── raw-20260413-120000.json        # Raw metric data
└── report-20260413-120000.txt      # Human-readable report
```

### Key Metrics to Watch

1. **`memory_add_duration p95`** — Must be < 200ms (Phase 9 benchmark)
2. **`memory_search_duration p95`** — Should be < 500ms
3. **`errors rate`** — Must be < 5%
4. **`http_req_duration p95`** — General health indicator

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| High p95 latency | DB connection pool exhaustion | Increase `PG_POOL_SIZE` |
| High error rate | Auth token mismatch | Verify `ALLURA_MCP_AUTH_TOKEN` |
| Connection refused | Server not running | Run `bun run mcp:http` |
| Timeout errors | Under-provisioned server | Increase CPU/memory |
| Inconsistent results | Network jitter | Run multiple times, average |

## Customization

### Adjusting VU Count

Edit `k6-load-test.js` and modify the `stages` in the `load` scenario:

```javascript
stages: [
  { duration: '30s', target: 50 },   // Ramp to 50
  { duration: '60s', target: 200 },  // Ramp to 200
  { duration: '60s', target: 200 },  // Hold at 200
  { duration: '30s', target: 0 },    // Ramp down
],
```

### Adjusting Thresholds

```javascript
thresholds: {
  memory_add_duration: ['p(95)<200'],  // Tighten to 150ms
  memory_search_duration: ['p(95)<300'], // Tighten to 300ms
  errors: ['rate<0.01'],                 // Tighten to 1%
},
```

### Running Only Smoke Test

```bash
k6 run --scenarios smoke tests/load/k6-load-test.js
```

### Running Only Load Test

```bash
k6 run --scenarios load tests/load/k6-load-test.js
```

### Stress Testing

For stress testing beyond Phase 9 targets:

```bash
# Override VUs and duration via command line
k6 run \
  --env BASE_URL=http://localhost:3201 \
  --stage 30s:200 \
  --stage 60s:500 \
  --stage 30s:0 \
  tests/load/k6-load-test.js
```

## CI Integration

Add to your CI pipeline:

```yaml
# GitHub Actions example
- name: Run Load Tests
  run: |
    bun run mcp:http &
    sleep 5  # Wait for server startup
    bun run load-test
  env:
    BASE_URL: http://localhost:3201
    ALLURA_MCP_AUTH_TOKEN: ${{ secrets.ALLURA_MCP_AUTH_TOKEN }}
```

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────┐
│   k6 VUs    │────▶│  Allura Memory MCP HTTP Gateway      │
│  (100 max)  │     │  (port 3201)                         │
│             │     │                                      │
│  Tests:     │     │  Endpoints:                          │
│  • health   │     │  POST /mcp        (MCP Streamable)   │
│  • memory_*│     │  POST /mcp        (tools/call)        │
│  • metrics  │     │  GET  /health      (Health check)   │
│  • curator  │     │  GET  /api/ready   (Readiness)      │
│             │     │  GET  /api/live    (Liveness)        │
│             │     │  GET  /api/metrics (Prometheus)      │
└─────────────┘     └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
              │ PostgreSQL │ │ RuVector  │ │  Sentry   │
              │ (episodic) │ │ (semantic)│ │ (metrics) │
              └───────────┘ └───────────┘ └───────────┘
```

## Troubleshooting

### Server Won't Start

```bash
# Check if port is in use
lsof -i :3201

# Check PostgreSQL
docker exec knowledge-postgres pg_isready -U ronin4life -d memory

# Check RuVector (pgvector extension in the same PostgreSQL instance)
docker exec knowledge-postgres psql -U ronin4life -d memory -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

### k6 Installation Issues

```bash
# Verify k6 is in PATH
which k6
k6 version

# Run with Docker instead
docker run --rm --network host grafana/k6:latest run \
  --env BASE_URL=http://localhost:3201 \
  - <tests/load/k6-load-test.js
```

### Auth Errors

If the server has `ALLURA_MCP_AUTH_TOKEN` set, you must provide it:

```bash
ALLURA_MCP_AUTH_TOKEN=$(grep ALLURA_MCP_AUTH_TOKEN .env | cut -d= -f2) \
  bun run load-test
```
