# Allura React portfolio preview

Self-contained React/Vite source for the Allura portfolio demonstration. The source, six shared UI modules, two brand images, existing licenses and provenance are included here. No repository root dependencies or source aliases are required.

Use Bun 1.3.14 and Node.js 20 or newer:

```sh
cd examples/react-portfolio-preview
bun install --frozen-lockfile --ignore-scripts
bun run test
bun run typecheck:walkthrough
bun run build
bun run dev
```

Open `http://127.0.0.1:4008/index.html#review`. The development server binds to loopback and requires port 4008 to be free. The production bundle is generated in `dist/`.

All people, records, policies, reviews, orders and connections are fictional samples. State remains in browser memory and resets on reload. No backend, authenticated access, Shopify account, live approval, source promotion or external action is connected. The four existing test suites cover 26 component/model cases; the TypeScript command checks the walkthrough only, not the entire vendored template.

The source preserves the current preview's behavior. The build emits existing client-directive, CSS compatibility and large-chunk warnings; a successful build does not establish support for older browsers. Current browser visual, responsive and keyboard verification remains unconfirmed because the browser tool denied access to the local preview. Existing portable single-file HTML is unchanged.

`PREVIEW-SCOPE.md` preserves earlier scope history with location corrections. `provenance/source-copy-manifest.json` records exact source-copy hashes; `provenance/migration-receipt.json` records packaging scope. Existing upstream MIT notices and provenance remain in `studio-baseui/` and `studio-ui/`; historical receipts are under `provenance/history/`. Unused vendored template files remain as source reference; only reachable runtime dependencies are installed. No new license for Allura brand assets is asserted.

A clean export of the staged package passed frozen installation, all 26 tests, the scoped TypeScript check and production build. See `provenance/clean-export-receipt.json`; this does not establish browser acceptance or production readiness.
