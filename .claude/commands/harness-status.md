# /harness-status

Show the harness health, loaded servers, and available skills.

## Usage

```
/harness-status
```

## How It Works

1. Checks harness configuration
2. Lists loaded MCP servers (from settings.json)
3. Shows available skills with preferred executors
4. Displays last N events from PostgreSQL
5. Reports any errors or pending approvals

## Result

```json
{
  "harness": {
    "group_id": "allura-system",
    "agent_id": "brooks",
    "postgres_available": true
  },
  "loaded_servers": ["allura-brain", "perplexica", "context7"],
  "approved_pending": ["postgresql"],
  "available_skills": [
    {"name": "code-review", "executor": "pike-interface-review"},
    {"name": "postgres-optimization", "executor": "woz-builder"}
  ],
  "recent_events": 12
}
```

**Note:** Use this to verify the harness is healthy before running operations.
