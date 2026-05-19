# Runtime Health Partial Evidence - 2026-05-17

## Scope

This artifact records the current Phase 4 `runtime-health` evidence for the
Mission Control development target.

Target:

- `http://127.0.0.1:3334`

## Port State

Host socket inspection:

```text
ss -ltnp 'sport = :3334'
```

Result:

```text
LISTEN 0 511 *:3334 *:* users:(("next-server (v1",pid=1961491,fd=22))
```

## Liveness

Command:

```text
curl -i http://127.0.0.1:3334/api/health/live
```

Result:

```text
HTTP/1.1 200 OK
{"alive":true,"uptime":27372.964185928,"timestamp":"2026-05-17T17:50:25.707Z"}
```

## Readiness

Bounded command:

```text
curl --max-time 10 -i http://127.0.0.1:3334/api/health/ready
```

Result:

```text
curl: (28) Operation timed out after 10002 milliseconds with 0 bytes received
```

Unbounded command eventually returned:

```text
HTTP/1.1 503 Service Unavailable
{"ready":false,"checks":{"postgres":{"name":"postgres","healthy":true,"latencyMs":113},"neo4j":{"name":"neo4j","healthy":true,"latencyMs":1131},"mcp":{"name":"mcp","healthy":false,"latencyMs":0}},"timestamp":"2026-05-17T17:52:28.674Z"}
```

Legacy readiness command:

```text
curl --max-time 10 -i http://127.0.0.1:3334/api/ready
```

Result:

```text
curl: (28) Operation timed out after 10002 milliseconds with 0 bytes received
```

The unbounded legacy readiness command also eventually returned `503 Service
Unavailable` with `mcp.healthy=false`.

## Result

The Phase 4 `runtime-health` gate remains `PARTIAL`.

- Liveness passed.
- Readiness is not healthy because the MCP check is false.
- Bounded readiness did not return within 10 seconds.
- Container health output was not captured.

Do not mark the `runtime-health` gate as passed until readiness and container
health evidence are both recorded.

## Receipts

- Notion: `3631d9be-65b3-8133-b63d-d40473f4f32c`
- Brain: `d9bbabb7-676a-4eb7-959b-942d07103c5e`
- Readiness addendum Notion: `3631d9be-65b3-81c0-951c-f24cc2ef35cf`
- Readiness addendum Brain: `0179208e-9e61-4226-af31-f9a7d8fb2135`
