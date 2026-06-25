# Laptop Migration + Clerk Activation Runbook

> Scope: move Allura Memory to a new Ubuntu laptop with zero data loss, and flip
> auth from DevAuth → Clerk. Non-canonical operational doc (archive surface).
> Last updated: 2026-06-25.

---

## TL;DR

1. Git brings the **code**. It does **not** bring secrets or data.
2. Hand-carry 2 files (`.env`, `.env.local`) and 3 Docker volumes.
3. Clerk is already coded and installed — activation is 2 keys + per-user role tags.

---

## Part A — Laptop Migration

### A1. What git already carries
The repo (code, `docker-compose.yml`, `.env.example`, docs). Nothing secret —
`.env` and `.env.local` are gitignored on purpose.

### A2. What you MUST hand-carry (not in git)

| Item | Path / name | Why |
|------|-------------|-----|
| Root env | `.env` (mode 600) | PG/Neo4j passwords, dev-auth toggle |
| Secret env | `.env.local` (mode 600) | Clerk keys, `ALLURA_MCP_TOKEN_SECRET` |
| PG data volume | `memory_postgres_data` (external) | episodic traces + vectors |
| Neo4j data volume | `neo4j_data` (external) | semantic knowledge graph |
| Neo4j logs volume | `neo4j_logs` (external) | optional, audit continuity |
| Docker network | `knowledge-network` (external) | stack won't `up` without it |

Copy the env files over an encrypted channel (USB you control, or `scp`). Do
**not** email or paste them into chat.

### A3. Back up the Docker volumes (OLD machine)

```bash
cd ~/allura-backup 2>/dev/null || mkdir -p ~/allura-backup && cd ~/allura-backup
for V in memory_postgres_data neo4j_data neo4j_logs; do
  docker run --rm -v "$V":/data -v "$PWD":/backup alpine \
    tar czf "/backup/$V.tar.gz" -C /data .
done
ls -lh   # three .tar.gz files — copy these to the new laptop
```

### A4. Restore on the NEW laptop

```bash
# 0) Prereqs: install Docker + Bun, then clone the repo and `bun install`.
git clone <your-remote> allura-memory && cd allura-memory
bun install

# 1) Recreate the external network + volumes BEFORE first `compose up`
docker network create knowledge-network
for V in memory_postgres_data neo4j_data neo4j_logs; do docker volume create "$V"; done

# 2) Restore data into the volumes (point to where you copied the tarballs)
cd ~/allura-backup
for V in memory_postgres_data neo4j_data neo4j_logs; do
  docker run --rm -v "$V":/data -v "$PWD":/backup alpine \
    sh -c "cd /data && tar xzf /backup/$V.tar.gz"
done

# 3) Drop the two env files into the repo root (mode 600)
cd /path/to/allura-memory
chmod 600 .env .env.local

# 4) Bring the Brain up and verify
bun run brain:up
bun run brain:status
curl -fsS http://127.0.0.1:5888/ready && echo "  gateway READY"
```

### A5. Migration acceptance check
- [ ] `bun run brain:status` all green
- [ ] `http://127.0.0.1:5888/ready` returns OK
- [ ] A `memory_search` returns your existing memories (data restored, not empty)
- [ ] `bun run typecheck` passes (code intact)

---

## Part B — Clerk Activation

The code is done: `@clerk/{backend,nextjs,react,shared}` are installed and
`src/proxy.ts` loads Clerk automatically when both keys are present. You only
provide config + per-user roles.

### B1. Get the keys (HITL — only you can)
1. Go to https://dashboard.clerk.com → your app → **API Keys**.
2. Copy the **Publishable key** (`pk_...`) and **Secret key** (`sk_...`).

### B2. Put them in `.env.local` (never `.env.example`, never git)

```bash
cat >> .env.local <<'EOF'
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/v2/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/v2/register
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
EOF
chmod 600 .env.local
```

Then turn DevAuth off so Clerk is authoritative in production:

```bash
# in .env  → set:
ALLURA_DEV_AUTH_ENABLED=false
NODE_ENV=production
```

### B3. Tag each user's role + tenant
Allura reads role and group from Clerk `publicMetadata.allura`. For every user,
in the Clerk dashboard (User → Metadata → Public) set:

```json
{ "allura": { "role": "admin", "groupId": "allura-system" } }
```

Role hierarchy: `admin > curator > viewer`. `groupId` must match
`^allura-[a-z0-9-]+$`. Anyone with no metadata defaults to `viewer` /
`allura-system`.

### B4. Verify Clerk is live
- [ ] `bun run dev`, open a protected route (`/curator`) while logged out → redirected to `/auth/v2/login`
- [ ] Log in as a `viewer` → hitting `/admin` returns 403 / `/unauthorized`
- [ ] Log in as `admin` → `/admin` loads
- [ ] An authorized API call carries the right `groupId` (check an audit event)

---

## Gotchas

- **Stack won't start on a fresh machine** until `knowledge-network` and the 3
  volumes exist (they're `external: true`). Do A4 step 1 first.
- **`NEO4J_URI` must be `bolt://`**, not `neo4j://` — the routing scheme hangs
  the driver on a single-instance server.
- **`ALLURA_MCP_TOKEN_SECRET`** is not yet in either env file. It's required to
  mint/verify MCP bearer tokens (Gabriel/Samuel onboarding). Generate once with
  `openssl rand -base64 32` and store in `.env.local` on the new laptop — it must
  be the SAME value the Brain runtime uses, or previously minted tokens break.
- **Clerk keys are environment-specific.** `pk_test/sk_test` for dev,
  `pk_live/sk_live` for production. Don't mix.
