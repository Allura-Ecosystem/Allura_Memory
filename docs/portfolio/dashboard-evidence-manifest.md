# Dashboard Evidence Manifest

The dashboard browser capture emits a machine-readable manifest at
`artifacts/dashboard-demo/manifest.json`. This document describes its contract.

## Shape

```json
{
  "generatedAt": "ISO-8601 timestamp",
  "base": "http://127.0.0.1:4100",
  "routes": [
    {
      "route": "/dashboard",
      "name": "overview",
      "viewport": "desktop",
      "width": 1440,
      "height": 1000,
      "status": 200,
      "finalUrl": "http://127.0.0.1:4100/dashboard",
      "redirected": false,
      "consoleErrors": [],
      "pageErrors": [],
      "screenshot": "overview-desktop.png",
      "snapshot": "overview-desktop.snapshot.txt",
      "ok": true
    }
  ],
  "summary": { "total": 14, "ok": 14, "failed": 0 }
}
```

The example abbreviates `routes` to one entry; a real clean manifest contains
fourteen entries, one per route/viewport pair. `width` and `height` describe the
CSS viewport, not the full-page PNG dimensions. Mobile entries use
`"viewport": "mobile", "width": 390, "height": 844` and `*-mobile` filenames.

## Acceptance

- `summary.ok` must equal `summary.total` (fourteen captures: seven routes × two
  viewports) for a clean run. Every route/viewport pair must occur exactly once,
  with distinct screenshot and snapshot paths.
- A failed route has `ok: false`, `screenshot: null`, and its `consoleErrors` /
  `pageErrors` / `status` / `redirected` fields describe the failure.
- No image is emitted for a failed route; a screenshot filename is only present
  when `ok` is true.
- Snapshot/diagnostic JSON must be successful and structurally valid; empty
  snapshots, console errors, page exceptions, and unsettled live DOM states
  cannot qualify as healthy evidence. A snapshot may be null if capture fails.
- Matching artifacts from prior runs are removed before each capture attempt.
  Historical unsuffixed PNGs are not evidence for this manifest contract.
- Only the runner's named browser session is closed. A clean manifest proves
  route capture only; it does not prove button interactions or authorize release.
