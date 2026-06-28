# AC6 Cutover Runbook — FaithMeats Home-Cloud

**Date prepared:** 2026-06-28  
**Commit:** `5936c7b` feat(ac6): server-side group_id enforcement  
**Branch:** `feat/faithmeats-onboarding`  
**Operator:** Sabir Asheed  
**Status:** READY TO EXECUTE (DB migration already applied, do NOT re-run migration steps)

---

## What This Runbook Does

Promotes the AC6 tenant-enforcement gateway from code-only (committed, pushed, not yet
running) to live. After cutover:

- `mcp.faithmeats.org/mcp` requires a valid Cloudflare Access JWT (RS256, verified against
  `CF_ACCESS_AUD`). No JWT = 401.
- `chat.faithmeats.org` → OpenWebUI → `allura-mcpo` → Brain requires
  `X-Allura-Internal-Token` header. Missing or wrong token = 403 default-deny.
- group_id is derived server-side from the verified email identity. Clients can no longer
  spoof a tenant namespace.

**The live surfaces are unaffected until Step 4.** Steps 1–3 are prep only.

---

## Stack Map (verified from running containers)

| Container | Image | Compose file / origin | Endpoint |
|---|---|---|---|
| `allura-memory-mcp` | built from source (`Dockerfile.mcp`) | `/home/roninhub/Projects/Allura-ecosystem/allura-memory/docker-compose.yml`, service `mcp` | `127.0.0.1:5888` → container port `3201` |
| `allura-mcpo` | `ghcr.io/open-webui/mcpo:main` | **manually run** (no compose file) | `127.0.0.1:8000` → container port `8000` |
| `open-webui` | `ghcr.io/open-webui/open-webui:main` | `/home/roninhub/open-webui-stack/docker-compose.yml` | `127.0.0.1:8080` |
| `cloudflared-open-webui` | `cloudflare/cloudflared:latest` | same open-webui-stack compose | (tunnel only) |
| `knowledge-postgres` | `pgvector/pgvector:pg16` | allura-memory compose | `127.0.0.1:5432` |
| `knowledge-neo4j` | `neo4j:5.26.0-community` | allura-memory compose | `127.0.0.1:7474 / 7687` |

**Networks:** `allura-mcpo` is connected to both `knowledge-network` (reaches `allura-memory-mcp`
by DNS name) and `open-webui-stack_default` (reachable as `allura-mcpo:8000` from `open-webui`).

---

## Prerequisites

- [ ] `bws` (Bitwarden Secrets CLI) installed and `~/.config/allura/bws-token` populated
- [ ] You have the Cloudflare Zero Trust dashboard open: **Zero Trust → Access → Applications → mcp.faithmeats.org**
- [ ] You know the two Cloudflare values: **Team Domain** and **AUD tag** (see the app Overview tab)
- [ ] You can generate a 32-byte hex secret with `openssl rand -hex 32`
- [ ] The helper script `scripts/ac6-cutover.sh` is executable (`chmod +x scripts/ac6-cutover.sh`)

---

## Step 1 — Pre-Flight: Confirm Baseline

**Confirm you are on the right branch and commit.**

```bash
cd /home/roninhub/Projects/Allura-ecosystem/allura-memory
git status
git log --oneline -3
```

Expected output includes `5936c7b feat(ac6): server-side group_id enforcement`.

**Confirm all containers are running and healthy.**

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected: `allura-memory-mcp`, `allura-mcpo`, `open-webui`, `cloudflared-open-webui`,
`knowledge-postgres`, `knowledge-neo4j` — all `Up` (healthy where applicable).

**Confirm baseline /ready returns 200** (Brain is up with the OLD code — no AC6 enforcement yet).

```bash
curl -s -o /dev/null -w "Brain /ready: %{http_code}\n" http://127.0.0.1:5888/ready
```

Expected: `Brain /ready: 200`

**Confirm mcpo serves its OpenAPI schema** (bridge is reachable).

```bash
curl -s -o /dev/null -w "mcpo /openapi.json: %{http_code}\n" http://127.0.0.1:8000/openapi.json
```

Expected: `mcpo /openapi.json: 200`

**Verification gate:** All checks pass before continuing. If any container is unhealthy or
the /ready is not 200, do not proceed — investigate first.

---

## Step 2 — Set the Three Required Environment Variables

The AC6 gateway reads these from `.env.local` (loaded by the compose `mcp` service via
`env_file: .env.local`). They have no defaults and the gateway fails closed if any is absent.

### 2a. Retrieve the Cloudflare Access values

Log in to the Cloudflare Zero Trust dashboard:

1. **Team Domain:** Zero Trust → Settings → Custom Pages → your team domain  
   Format: `<yourteam>.cloudflareaccess.com`

2. **AUD tag:** Zero Trust → Access → Applications → select the `mcp.faithmeats.org` application
   → Overview tab → "Application Audience (AUD) Tag"  
   Format: 64-character hex string

### 2b. Generate `ALLURA_INTERNAL_CHAT_TOKEN`

Run this command and **copy the output to your clipboard** — you will need it in both
Step 2c and Step 3. Do not write it to disk outside of the controlled locations below.

```bash
openssl rand -hex 32
```

### 2c. Store all three secrets in Bitwarden Secrets Manager

> **Reference only** — the owner runs these commands interactively. Do not automate
> secret writes in CI or scripts.

```bash
# Authenticate bws (one-time per session)
export BWS_ACCESS_TOKEN="$(cat ~/.config/allura/bws-token | tr -d ' \t\r\n')"

# Find your project ID
bws project list -o json | python3 -c \
  "import sys,json; d=json.load(sys.stdin); [print(p['id'], p['name']) for p in d]"

# Store each secret (replace PROJECT_ID with yours, and supply actual values when prompted)
# Run one at a time. bws will confirm creation.
bws secret create CF_ACCESS_TEAM_DOMAIN "<your-team-domain>" <PROJECT_ID>
bws secret create CF_ACCESS_AUD "<your-aud-tag>" <PROJECT_ID>
bws secret create ALLURA_INTERNAL_CHAT_TOKEN "<your-generated-hex>" <PROJECT_ID>
```

### 2d. Write the three vars to `.env.local`

`.env.local` is `.gitignored` and takes precedence over `.env` when loaded by docker compose.
Open it with your editor and append the three vars at the bottom:

```
# AC6 Cloudflare Access enforcement (added during cutover)
CF_ACCESS_TEAM_DOMAIN=<your-team-domain>
CF_ACCESS_AUD=<your-aud-tag>
ALLURA_INTERNAL_CHAT_TOKEN=<your-generated-hex>
```

File location: `/home/roninhub/Projects/Allura-ecosystem/allura-memory/.env.local`

Set permissions:

```bash
chmod 600 /home/roninhub/Projects/Allura-ecosystem/allura-memory/.env.local
```

**Verification:** Confirm the three vars are present (values are not printed):

```bash
grep -c "CF_ACCESS_TEAM_DOMAIN\|CF_ACCESS_AUD\|ALLURA_INTERNAL_CHAT_TOKEN" \
  /home/roninhub/Projects/Allura-ecosystem/allura-memory/.env.local
```

Expected: `3`

---

## Step 3 — Wire the mcpo Bridge to Send `X-Allura-Internal-Token`

The `allura-mcpo` container was started **manually** (no compose file). Its current command:

```
mcpo --host 0.0.0.0 --port 8000 --server-type streamable_http \
     -- http://allura-memory-mcp:3201/mcp
```

The AC6 chat path in `src/mcp/ac6-auth-guard.ts` (line 101) reads the request header
`x-allura-internal-token` and does a timing-safe compare against `ALLURA_INTERNAL_CHAT_TOKEN`.
Without this header, the Brain defaults to 403 on every mcpo call.

**The fix:** re-create `allura-mcpo` with the `--header` flag added (mcpo supports
`-H / --header` in JSON format, confirmed from `mcpo --help`).

**Config change — exact new docker run command (replace `<TOKEN>` with your generated hex):**

```bash
docker stop allura-mcpo
docker rm allura-mcpo
docker run \
  --name allura-mcpo \
  --detach \
  --restart unless-stopped \
  --network knowledge-network \
  --network open-webui-stack_default \
  -p 127.0.0.1:8000:8000 \
  ghcr.io/open-webui/mcpo:main \
  --host 0.0.0.0 \
  --port 8000 \
  --server-type streamable_http \
  --header '{"X-Allura-Internal-Token":"<TOKEN>"}' \
  -- http://allura-memory-mcp:3201/mcp
```

> **SECURITY:** `<TOKEN>` is the value of `ALLURA_INTERNAL_CHAT_TOKEN`. Pass it inline
> on the command line — do not write it to a file. The shell history line will contain it;
> clear history after this step with `history -d $(history 1 | awk '{print $1}')` or use
> the helper script `scripts/ac6-cutover.sh` which reads the token from the env variable
> and never echoes it.

**Why two `--network` flags:** Docker `docker run` only accepts one `--network` at creation
time and then additional networks must be connected with `docker network connect`. Use:

```bash
docker stop allura-mcpo
docker rm allura-mcpo

docker run \
  --name allura-mcpo \
  --detach \
  --restart unless-stopped \
  --network knowledge-network \
  -p 127.0.0.1:8000:8000 \
  ghcr.io/open-webui/mcpo:main \
  --host 0.0.0.0 \
  --port 8000 \
  --server-type streamable_http \
  --header "{\"X-Allura-Internal-Token\":\"${ALLURA_INTERNAL_CHAT_TOKEN}\"}" \
  -- http://allura-memory-mcp:3201/mcp

# Attach to the open-webui network so open-webui can reach allura-mcpo:8000
docker network connect open-webui-stack_default allura-mcpo
```

**Verification:** mcpo responds to its health check (OpenAPI schema is still served):

```bash
curl -s -o /dev/null -w "mcpo /openapi.json after rewire: %{http_code}\n" \
  http://127.0.0.1:8000/openapi.json
```

Expected: `200`

**Note:** The Brain is still running the OLD code at this point — the header is now being
sent but the AC6 guard is not yet enforcing it. This is intentional. Step 4 flips the Brain.

---

## Step 4 — Rebuild and Restart Only the Brain MCP Gateway

**Tag the pre-cutover image for fast rollback before rebuilding:**

```bash
docker tag allura-memory-mcp allura-memory-mcp:pre-ac6
```

**Rebuild and restart the `mcp` service only** (Postgres and Neo4j are unaffected):

```bash
cd /home/roninhub/Projects/Allura-ecosystem/allura-memory

docker compose \
  --env-file .env \
  --env-file .env.local \
  up -d --build mcp
```

This command:
1. Builds a new image from the current working tree (`Dockerfile.mcp`) — AC6 code at 5936c7b
2. Injects the three new env vars from `.env.local` into the container at runtime
3. Replaces `allura-memory-mcp` with the new image, leaving all other services untouched

**Network caveat:** `docker compose up` recreates the container. The `mcp` service declares
only `knowledge-network` in the compose file, which is all it needs — `allura-mcpo` connects
to it by container name (`allura-memory-mcp`) on that network.

**Wait for healthy:**

```bash
# Poll until healthy (up to 60 s)
for i in $(seq 1 12); do
  STATUS=$(docker inspect allura-memory-mcp --format '{{.State.Health.Status}}' 2>/dev/null)
  echo "  $(date +%H:%M:%S) health: ${STATUS}"
  [ "${STATUS}" = "healthy" ] && break
  sleep 5
done
```

**Verification:**

```bash
curl -s -o /dev/null -w "Brain /ready after rebuild: %{http_code}\n" \
  http://127.0.0.1:5888/ready
```

Expected: `200`

---

## Step 5 — Smoke Tests (All Must Pass Before Declaring Done)

Run each test in sequence. A single FAIL halts the cutover and triggers rollback (Step 6).

### Test A — Direct MCP path returns 401 for unauthenticated request

```bash
curl -s -o /dev/null -w "%{http_code}" \
  --max-time 15 \
  https://mcp.faithmeats.org/mcp
```

Expected: `401` with a `WWW-Authenticate: Bearer` or a Cloudflare Access redirect (302/403
from Access, not from the Brain). Specifically: a raw unauthenticated request must NOT get
a 200 or MCP tools listing. Access is blocking it before the Brain sees it.

To verify the Brain's own auth enforcement on the direct surface (bypasses CF Access, tests
the local port):

```bash
curl -s -w "\n%{http_code}" \
  -X POST http://127.0.0.1:5888/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}},"id":1}'
```

Expected: HTTP `403` and a JSON body containing `auth_no_jwt` (no credential provided,
default-deny path in ac6-auth-guard.ts line 173).

### Test B — Chat path round-trip via mcpo (allura-faithmeats memory_list)

```bash
curl -s \
  --max-time 15 \
  http://127.0.0.1:8000/memory_list \
  -H "Content-Type: application/json" \
  -d '{"group_id":"allura-faithmeats","limit":5}'
```

Expected: HTTP `200` with a JSON body containing a `memories` array (may be empty but
the call must succeed). This proves mcpo → Brain internal token auth is wired correctly
and the chat path pins to `allura-faithmeats`.

### Test C — Cross-tenant request is denied

Attempt to reach `allura-system` via the chat path (mcpo → Brain). The chat path is pinned
to `allura-faithmeats` in `tenant-resolver.ts` (`CHAT_PINNED_GROUP_ID`). An attempt to
override to `allura-system` must be rejected.

```bash
curl -s \
  --max-time 15 \
  http://127.0.0.1:8000/memory_list \
  -H "Content-Type: application/json" \
  -d '{"group_id":"allura-system","limit":5}'
```

Expected: HTTP `400` with a JSON body containing `chat_invalid_group_override`.
This is the exact error thrown by `assertChatGroupId` in `src/lib/auth/tenant-resolver.ts`
(line 186–191) when the client attempts to override the pinned `allura-faithmeats` group_id.
The call must NOT return 200 or any `allura-system` data.

### Test D — /ready and /health return 200

```bash
curl -s -o /dev/null -w "Brain /ready:  %{http_code}\n" http://127.0.0.1:5888/ready
curl -s -o /dev/null -w "Brain /health: %{http_code}\n" http://127.0.0.1:5888/health
```

Expected: both `200`.

### Test E — OpenWebUI is still reachable (chat surface not broken)

```bash
curl -s -o /dev/null -w "OpenWebUI /health: %{http_code}\n" \
  --max-time 10 http://127.0.0.1:8080/health
```

Expected: `200`

And via the public tunnel (no Cloudflare Access credential needed for the UI health check):

```bash
curl -s -o /dev/null -w "chat.faithmeats.org: %{http_code}\n" \
  --max-time 15 https://chat.faithmeats.org
```

Expected: `200` (Cloudflare Access login page or the chat UI — not a 5xx).

**All 5 tests must pass.** If any fail, go directly to Step 6.

---

## Step 6 — Rollback

**If smoke tests fail, act immediately.** A bad cutover means the Brain's AC6 guard is
rejecting all calls — every chat.faithmeats.org tool call fails.

### Fast rollback (< 2 minutes)

**Revert the Brain to the pre-cutover image:**

```bash
# Stop and remove the new container
docker stop allura-memory-mcp
docker rm allura-memory-mcp

# Start the pre-cutover image directly (no compose, no rebuild)
cd /home/roninhub/Projects/Allura-ecosystem/allura-memory

docker run \
  --name allura-memory-mcp \
  --detach \
  --restart unless-stopped \
  --network knowledge-network \
  -p 127.0.0.1:5888:3201 \
  --env-file .env \
  --env-file .env.local \
  -e NODE_ENV=production \
  -e POSTGRES_HOST=knowledge-postgres \
  -e POSTGRES_PORT=5432 \
  -e NEO4J_URI=bolt://knowledge-neo4j:7687 \
  -e ALLURA_MCP_HTTP_PORT=3201 \
  -e ALLURA_MCP_HTTP_ENABLED=true \
  allura-memory-mcp:pre-ac6 \
  bun run src/mcp/canonical-http-gateway.ts
```

> Note: The pre-ac6 image does NOT enforce the AC6 guard, so it will accept calls without
> the internal token. This means chat surface is immediately restored.

**Alternatively, use docker compose to rebuild from the previous commit:**

```bash
cd /home/roninhub/Projects/Allura-ecosystem/allura-memory
git stash   # or checkout the prior commit
docker compose --env-file .env --env-file .env.local up -d --build mcp
```

**Revert allura-mcpo** (remove the `--header` flag so the old code path works):

```bash
docker stop allura-mcpo
docker rm allura-mcpo

docker run \
  --name allura-mcpo \
  --detach \
  --restart unless-stopped \
  --network knowledge-network \
  -p 127.0.0.1:8000:8000 \
  ghcr.io/open-webui/mcpo:main \
  --host 0.0.0.0 \
  --port 8000 \
  --server-type streamable_http \
  -- http://allura-memory-mcp:3201/mcp

docker network connect open-webui-stack_default allura-mcpo
```

**Verify recovery:**

```bash
curl -s -o /dev/null -w "Brain /ready: %{http_code}\n" http://127.0.0.1:5888/ready
curl -s -o /dev/null -w "mcpo /openapi.json: %{http_code}\n" http://127.0.0.1:8000/openapi.json
```

Both must return `200`. If the Brain /ready is still not 200 after 30 seconds, check logs:
`docker logs allura-memory-mcp --tail 50`.

---

## Known Unknowns

The following could not be fully resolved from the repo alone — flag before executing:

1. **`allura-mcpo` has no compose file.** The container was started manually and has no
   `com.docker.compose.*` labels. The `docker run` command in Step 3 above reconstructs the
   equivalent from `docker inspect`. Verify the flags match your actual container before
   running (`docker inspect allura-mcpo | grep -A5 '"Cmd"'`).

2. **Cloudflare Access tunnel routing for `mcp.faithmeats.org`.** The runbook assumes a
   separate Cloudflare tunnel and Access application are already configured for
   `mcp.faithmeats.org`. Test A (direct MCP returns 401) depends on the Access app being
   set to enforce authentication on the `/mcp` path. Verify in Zero Trust → Access →
   Applications before executing Step 5 Test A on the public URL.

3. **`mcpo --header` JSON format.** Tested via `docker run --rm ghcr.io/open-webui/mcpo:main --help`
   confirming `-H / --header` accepts a JSON string. The exact format used in Step 3 is
   `'{"X-Allura-Internal-Token":"<value>"}'`. If mcpo rejects this format (older image),
   try the key:value colon format: `--header 'X-Allura-Internal-Token:<value>'`.

4. **open-webui-stack_default network name.** Confirmed by `docker inspect allura-mcpo`
   as the second network. If the network name differs on your host, replace it in the
   `docker network connect` command with `docker network ls | grep webui`.

5. **Test C (cross-tenant denial) response code.** The exact HTTP status and JSON error
   code depend on the `assertChatGroupId` implementation in `tenant-resolver.ts`. The test
   is written conservatively ("must NOT succeed") — adjust the expected response if needed.
