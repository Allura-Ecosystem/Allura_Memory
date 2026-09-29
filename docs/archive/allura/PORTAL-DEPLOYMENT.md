# Human Portal Deployment Runbook

## Purpose

Publish the Clerk-authenticated human onboarding surface at `portal.faithmeats.org` without changing the machine MCP endpoint at `mcp.faithmeats.org`.

## Current deployment boundary

- The portal runs as an isolated `portal` Docker service from `docker-compose.portal.yml`.
- It is bound only to `127.0.0.1:3200`.
- Dev authentication is forcibly disabled in the production container.
- The Cloudflare Tunnel, DNS, and Cloudflare Access policy remain separate changes from the local container launch.
- The machine endpoint stays `https://mcp.faithmeats.org/mcp` and is never used as a browser login hostname.

## Required controls before public exposure

1. **Clerk production instance**
   - Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to the host's ignored `.env.local`.
   - Configure the Clerk session token template to expose `allura` from user public metadata.
   - Each approved portal user needs valid `allura.role`, `allura.groupId`, and `allura.workspaceId` metadata. The group must be `allura-faithmeats`; scope and role come from the approved workspace assignment.
   - Never set `ALLURA_DEV_AUTH_ENABLED=true` in the production portal.

2. **Cloudflare Access — human policy**
   - Create a self-hosted application for `portal.faithmeats.org` only.
   - Set an explicit human allow policy (approved emails or approved email domain); do not reuse the MCP service-token policy.
   - Keep the new app independent from `mcp.faithmeats.org` so browser identity and machine credentials cannot collide.

3. **Cloudflare DNS and Tunnel**
   - Add `portal.faithmeats.org` as a proxied CNAME to `5b984535-392e-4679-ab91-b8d31d097b32.cfargotunnel.com`.
   - Add this ingress before the final `http_status:404` rule in `/home/roninhub/.cloudflared/config.yml`:

     ```yaml
     - hostname: portal.faithmeats.org
       service: http://localhost:3200
     ```

   - Reload the tunnel service only after the local portal health check is green.

## Local service launch

From the repository root:

```bash
docker compose --env-file .env --env-file .env.local -f docker-compose.portal.yml up -d --build
curl --fail http://127.0.0.1:3200/api/health/live
```

Expected local health: HTTP `200`.

## Go-live verification

1. `https://portal.faithmeats.org/api/health` reaches the portal through Cloudflare.
2. A non-approved browser identity is denied by the portal's Cloudflare Access policy.
3. An approved identity reaches Clerk sign-in when not signed in.
4. A signed-in Clerk user without valid Allura metadata is denied by the application.
5. An approved workspace member reaches `/portal`.
6. An administrator can issue a credential once, dismiss it, list only safe fields, and revoke it.
7. `https://mcp.faithmeats.org/mcp` remains the machine transport and is unchanged.

## Rollback

1. Remove the `portal.faithmeats.org` ingress from the tunnel config and reload the tunnel.
2. Disable or remove the portal Cloudflare Access application.
3. Stop only the portal service:

```bash
docker compose --env-file .env --env-file .env.local -f docker-compose.portal.yml stop portal
```

Do not restart, rebuild, or modify the MCP gateway or database as part of portal rollback.
