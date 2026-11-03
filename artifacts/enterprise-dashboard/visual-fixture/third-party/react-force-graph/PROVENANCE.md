# Preview graph-engine provenance

Verified 2026-10-20. Applies only to the fictional-data React/Vite portfolio preview.

- Upstream: https://github.com/vasturiano/react-force-graph
- Package: `react-force-graph-3d`, pinned exactly to `1.29.2` in `../../package.json`.
- npm package source revision (`gitHead`): `d59a72d24d310567a05d1622fd1f9f2fd13bc8fd`.
- Tarball: https://registry.npmjs.org/react-force-graph-3d/-/react-force-graph-3d-1.29.2.tgz
- npm integrity: `sha512-FcMoZ5Kjy/0/0988SyRL4zX56Lk3BO/2Jr1mvUsfLRNQRgn9OTIA3BnAripTtk7TmLJdFEDAwNUrjy6Gtnlg3g==`.
- License: MIT. The published npm tarball omits its LICENSE file; `LICENSE` here was fetched from the exact upstream revision: https://raw.githubusercontent.com/vasturiano/react-force-graph/d59a72d24d310567a05d1622fd1f9f2fd13bc8fd/LICENSE . SHA-256 `5b6dc9ce44c7b73620b191c567339212bd00537af46fdedaf98304c34214cc9c`.
- Exact transitive dependency resolutions and integrities: `../../package-lock.json`, SHA-256 `795ec0a22830f85578e40f293675b54aa9579256639842e9535dd0f9f8cf8284`.
- Resolved engine: `3d-force-graph@1.80.1`; physics: `three-forcegraph@1.43.6`; preview-local Three.js: `three@0.186.1`; binding: `react-kapsule@2.6.0`.
- `THIRD-PARTY-NOTICES.txt` contains license texts for all 43 installed packages. No package lacked a retained license text after the direct-package recovery described above.

Reproduce from the repository root:

```sh
npm ci --prefix artifacts/enterprise-dashboard/visual-fixture --omit=peer --ignore-scripts --no-audit --no-fund
```

Peer React is deliberately omitted from the preview install. Node resolution verified both the root app and graph binding resolve the same repository-root `node_modules/react/index.js` (React 19.2.4). The graph adapter and engine resolve the preview-local Three.js installation. Root production package files and locks are unchanged. No lifecycle script was executed.

`connections-three.tsx` statically imports and actually renders `ForceGraph3D`; the library performs d3-based 3D layout and receives native sphere clicks. `connections-force-model.ts` provides renderer-owned mutable copies with stable IDs and retained positions. Provider/model objects and string-ID edges are never passed directly into the mutable engine. The existing Allura scorecards, records, routes, palette, Flat and List alternatives remain application-owned.

The layout uses 160 library warmup ticks with zero visible cooldown ticks, so records settle before display. Slow camera orbit is independently paused for selection, direct interaction, reduced-motion preference and hidden documents. The library renderer remains active for deliberate interaction; `pauseAnimation()` is not used as a rotation control. The old procedural two-lobe/R3F renderer was replaced, not wrapped or relabeled.

HTML tooltips are disabled; names are rendered as React text. No dynamic package import, external texture, font, model, analytics or service call is needed by the graph. Portfolio-only simulation does not provide authentication, security enforcement, live contact data or compliance.
