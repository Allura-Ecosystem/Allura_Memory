# Allura Clients UI

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

> Follow-up: the current local `/portal` implementation is now device-first and uses the approved allura brand. See [Devices, clients and profiles](portal-devices-and-profiles.md). The verification below describes the initial Clients-only commit, not a live-deployment receipt.

## Implemented surface

The guarded `/portal` route now renders a toolkit-style configuration screen in the shared dashboard shell. `Clients` links to it from dashboard navigation.

- Five named client cards: ChatGPT, Claude Desktop, Hermes, OpenCode, OpenClaw.
- A sixth Connect action for a custom client.
- Search, selected-client setup, keyboard focus return, responsive sidebar/cards.
- Guided setup for Hermes/OpenCode and manual setup for compatible custom clients.
- ChatGPT, Claude Desktop and OpenClaw explicitly require verified adapters; those screens do not issue credentials.
- Credential creation is an explicit action inside setup, prefills the selected client name, and uses the server-derived workspace passed by the page guard.
- Existing `/api/tokens` and scoped inventory/revocation APIs remain the authority. No backend auth, tenant policy or database changes are included.
- Raw credentials stay in the issuer's React state. Dismissal/navigation clears the displayed value; previews/copy contain placeholders only.
- Clients/Credentials navigation is disabled while issuance is pending. Clipboard requests are invalidated on navigation to prevent stale success messages.
- No fake Connected badge, fabricated test receipt, OAuth redirect, or automatic desktop configuration.

## Verification

Executed:

```sh
bun run test:unit src/lib/portal src/lib/auth/__tests__/dev-auth-production-guard.test.ts src/lib/auth/__tests__/web-principal.test.ts src/lib/mcp-token src/app/dashboard/device-pairing/__tests__/page.test.tsx
bun run typecheck
bun run build
git diff --cached --check
```

Results: 47 tests passed in 14 files; TypeScript passed; Next.js 16.2.1 production build exited 0. Portal test files are now included in the canonical unit lane (they were previously omitted).

Independent read-only review found a low-severity stale clipboard-status race. It was reproduced with a failing test, fixed with operation invalidation, and cleared on independent delta review. Static added-line scan found no secret patterns, browser credential persistence, eval, or HTML injection.

Playwright exercised the actual UI components in an isolated viewer-fixture preview at 1440x1024 and 390x844: six buttons present, OpenCode setup opens, search filters correctly, unsupported adapter guidance present, no horizontal overflow, zero JavaScript page errors. This preview was not an authenticated Cloudflare Access session and did not issue any real credentials.

## Release status and unresolved gates

The live container was NOT replaced during this UI task. The deployment governance check returned `pass:false`: its append-only invariant classified the natural-language deployment description as a mutation. No retry with alternate wording, policy bypass, service change, or database write followed that denial. Resolve the deployment gate through the authorized governance path before publishing.

This code is not proof that any desktop client is connected. Remaining work includes verified client adapters/OAuth and actual per-account sign-in and memory-isolation acceptance. Any retired provider credentials must remain revoked and deleted through the owner's secure workflow; never paste replacement values into chat.

Before any future image build, exclude `.env` and `.env.*` at every depth from the staging context. Next standalone output can copy environment files. Do not blindly relax `.dockerignore` or bake secrets into image layers. Keep the old portal available for rollback and preserve machine MCP.

## Documentation sources checked

- https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- https://opencode.ai/docs/mcp-servers/
- https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

Cloudflare Access dashboard identity and MCP authorization are distinct. The dashboard must verify the Access JWT at the server boundary; an Access session never substitutes for an MCP bearer credential. Confirm the deployed auth reader and three-user isolation before production activation.
