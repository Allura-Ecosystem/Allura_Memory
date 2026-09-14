# Devices, clients and profiles in allura

## Product model

Docker MCP Toolkit screenshots are interaction inspiration only. This is an allura surface using the existing Next.js portal and allura APIs. Desktop/laptop owners do not need Docker for this UI. The approved allura wordmark, lowercase product copy, IBM Plex Sans and scoped finalized blue/green/orange/charcoal/cream palette are used without recoloring or stretching the logo.

One human account owns access to authorized workspaces. Devices are entry points to that memory, not duplicated tenants. Profiles are reusable permission requests, not identities or secret containers.

## Navigation and behavior

`/portal` opens **Devices & clients** after `requireDashboardScope`. The component is keyed to the authenticated human, tenant and workspace so a changed scope remounts its local state.

- **Devices:** fetches the authenticated principal's approved devices. Cards show the server label, workspace and last credential-exchange timestamp in UTC. `Paired` does not mean `Online`. No sample devices are shipped in production code.
- **Manage device:** shows access actually linked through `paired_device_id`, plus client setup navigation. Linked token names represent human principals under the existing device contract, not an inventory of installed applications. Unpaired tokens retain their separate agent identities; `created_by` records the issuing human.
- **Disconnect / Mark lost:** open an inline confirmation. Only a confirmation bound to that device ID and operation sends the lifecycle request. Changing sections clears stale confirmation. Navigation is disabled while pending; keyboard focus enters the confirmation heading and returns to its initiating control on cancellation. The page checks the response status and device identifier before removing the card. Failure retains the device and offers retry.
- **Add device:** explains enrollment initiated on the target computer by a compatible local adapter. It does not synthesize a device key, enroll the current browser as the other computer, or create a fake device record. Refresh retrieves completed approvals.
- **Account connections:** client setup and active unpaired credential inventory. These keys are not represented as physical-device-bound access. Hosted-account connectors can be represented here once their adapters/OAuth are verified.
- **Profiles:** built-in `Read only` (`memory:read`) and `Read & write` (`memory:read`, `memory:write`). Applying a preset starts new setup; it does not modify existing credentials. Selection is local to the current page session. Custom editable/synchronized profiles are not implemented.

## API contracts reused — no schema changes

| UI operation | Existing route | Contract |
|---|---|---|
| List paired devices | `GET /api/device-pairing/devices` | Authenticated principal only; no client-supplied tenant/principal selectors. Safe `id`, `display_label`, `workspace_id`, `created_at`, `last_exchange_at` projection. |
| Disconnect | `POST /api/device-pairing/revoke` | Body contains only `device_id`. Existing server resolves current membership, tenant/workspace and ownership/admin authority. |
| Lost device | `POST /api/device-pairing/mark-lost` | Same authority boundary; terminal lost state revokes linked tokens. |
| Credential inventory | `GET /api/tokens?workspace_id=…` | Existing admin API scopes the server query. UI additionally filters active rows by exact device linkage, or null linkage for account connections. It ignores raw tokens/hashes. |
| Individual account credential revoke | `POST /api/tokens/:id/revoke` | Confirmed unpaired-key action with pending navigation lock. Device-linked credential inventory is inspection-only and uses the separate device lifecycle controls. |
| Account credential creation | `POST /api/tokens` | Existing admin-only API; UI submits server-derived workspace, client name and selected preset scopes. No `paired_device_id` is fabricated. |

Profiles never enlarge server authority. Read-only and read-write do not include delete, review, promotion or administrative permissions. Raw issued credentials remain ephemeral React state, are cleared when leaving setup, and never enter template previews, logs, URLs or browser persistence.

## Device-bound integration boundary

The current database index `idx_mcp_tokens_one_active_per_device` permits at most one non-revoked credential per paired device. A linked token's `agent_name` must be the paired device's human principal. Consequently **independent device-bound credentials for every installed client are not implemented by this UI change**.

Device enrollment and token exchange require proof of the device's key through the existing enrollment/approval/completion and challenge/exchange protocols. The generic `/api/tokens` issuer creates unpaired keys; it cannot be relabeled as device enrollment. Device-specific client setup therefore displays an integration gate and does not offer that issuer or a misleading Connected badge.

Before promising one-click device/client setup, implement and verify the local secure-store adapter and choose a reviewed client-installation credential model compatible with device rotation/revocation. Do not remove the uniqueness index or bypass proof to make a button look functional. Native OAuth adapters for hosted clients remain separate from Clerk portal login.

## Release and acceptance

This is a local source/UI implementation. The earlier deployment governance denial remains unresolved; the running portal has not been replaced. No production device/token or schema mutations, credential changes, policy changes, dependency installs, or new machine registrations are part of this work.

Tests use explicitly mocked HTTP responses. Browser preview uses actual components with labeled example-device fixtures, not a Clerk session or live pairing. Actual three-account sign-in, device secure-store runtime, end-to-end client connections and memory-isolation acceptance remain external gates. The earlier exposed Clerk secret still requires secure owner-managed rotation.

See [execution receipts](portal-devices-execution.md), [initial Clients UI](portal-clients-ui.md), [data dictionary](../allura/DATA-DICTIONARY.md), and [requirements traceability](../allura/REQUIREMENTS-MATRIX.md).

## Packaging reminder

The final standalone image must include `public/brand/` along with the built server and static chunks. Environment files must be excluded at every depth from the build context and image layers. Neither image packaging nor deployment occurred in this task.
