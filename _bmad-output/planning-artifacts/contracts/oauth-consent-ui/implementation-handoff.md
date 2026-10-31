# Consent UI implementation handoff

Read DESIGN.md, design-contract.md, the parent spec-team-mcp-oauth-browser-consent.md, existing ui/main.tsx/style.css/controls.tsx, src/dashboard-{transport,view,server}.ts and src/oauth-consent.ts. Reuse existing AL asset and IBM Plex imports. Do not edit retained design references or create a second brand.

First tracer must prove real issuer redirect → dedicated page → server-verified manually entered scope → exact one-use consent → explicit approval → owned callback, followed by real SDK exchange and MCP read-back. Then prove cancellation and the negative/recovery matrix sequentially.

Use existing cream/surface/ink/blue tokens, semantic form/notice patterns and Base UI Confirm. Phone layout stacks/wraps; maintain 44px controls and visible focus. A new CSS selector, if essential, must be consent-scoped. Unknown results require a fresh authorization, not inferred rollback or a retry button. No browser token exchange/storage.

Local DOM/browser evidence is not independent human visual acceptance. Keep real desktop/client/Cloudflare/release gates open. Worker returns evidence; parent checks and commits.
