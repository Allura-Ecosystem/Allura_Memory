# Epic 26 — Scheduler Health & Operator Module Evidence

Generated 2026-08-27 against a disposable PostgreSQL 16 container
(pgvector/pgvector:pg16, all 49 migrations applied, destroyed afterward).

## Story 26.4 AC-6 — scheduler health over real wall-clock time

Six real `runDiscoveryCycle` executions at a 20s interval against a real
database, with real inventory reconciled from this repo's own artifacts
(1274 lockfile records + 17 ci_workflow records).

### Heartbeat span
```
 heartbeats |          first_beat           |           last_beat           | span_seconds 
------------+-------------------------------+-------------------------------+--------------
          6 | 2026-08-27 18:37:48.026654+00 | 2026-08-27 18:39:28.387836+00 |          100
(1 row)

```

### Inter-beat gaps (what a health monitor alerts on)
```
 gap_seconds 
-------------
            
        20.0
        20.0
        20.2
        20.0
        20.1
(6 rows)

```

### Retry policy is in the durable audit record (AC-2 "auditable")
```
           jsonb_pretty            
-----------------------------------
 {                                +
     "retry": {                   +
         "max_attempts": 3,       +
         "max_delay_ms": 5000,    +
         "npm_attempts": 1,       +
         "osv_attempts": 1,       +
         "base_delay_ms": 500,    +
         "npm_succeeded": true,   +
         "osv_succeeded": true,   +
         "github_attempts": 1,    +
         "github_succeeded": true,+
         "npm_chunks_total": 1,   +
         "npm_chunks_failed": 0   +
     },                           +
     "alerts_created": 0,         +
     "drafts_generated": 0,       +
     "advisories_failed": 0,      +
     "advisories_processed": 0,   +
     "alerts_already_known": 0    +
 }
(1 row)

```

### Honest limitation

This is a **local repeated-process** run, not a systemd/production deployment.
It proves the worker executes repeatedly on a schedule and emits durable,
queryable health evidence with real timing. It does NOT prove behaviour under
production systemd supervision, host restarts, or over days rather than
minutes. The systemd unit files exist (`scripts/systemd/allura-threat-discovery.*`)
but have still never been installed on any host.
