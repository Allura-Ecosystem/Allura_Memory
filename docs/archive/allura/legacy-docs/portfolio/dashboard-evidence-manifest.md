# Dashboard Evidence Manifest

The dashboard browser capture emits a machine-readable manifest at
`artifacts/dashboard-demo/manifest.json`. This document describes its contract.

## Shape

```json
{
  "generatedAt": "ISO-8601 timestamp",
  "base": "http://127.0.0.1:3100",
  "routes": [
    {
      "route": "/dashboard",
      "name": "overview",
      "status": 200,
      "finalUrl": "http://127.0.0.1:3100/dashboard",
      "redirected": false,
      "consoleErrors": [],
      "pageErrors": [],
      "screenshot": "overview.png",
      "ok": true
    }
  ],
  "summary": { "total": 7, "ok": 7, "failed": 0 }
}
```

## Acceptance

- `summary.ok` must equal `summary.total` (seven routes) for a clean run.
- A failed route has `ok: false`, `screenshot: null`, and its `consoleErrors` /
  `pageErrors` / `status` / `redirected` fields describe the failure.
- No image is emitted for a failed route; a screenshot filename is only present
  when `ok` is true.
