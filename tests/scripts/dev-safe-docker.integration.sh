#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

: "${ALLURA_DEV_SAFE_DOCKER_ENDPOINT:=unix:///home/ronin704/.docker/desktop/docker.sock}"
: "${ALLURA_DEV_SAFE_DASHBOARD_PORT:=4002}"
export ALLURA_DEV_SAFE_DASHBOARD_PORT
docker=(docker --host "$ALLURA_DEV_SAFE_DOCKER_ENDPOINT")
project="allura-dev-safe-it-$$"
compose=("${docker[@]}" compose --project-name "$project" --project-directory "$root" --env-file /dev/null --file "$root/docker-compose.dev-safe.yml")
probe_paths=(
  .claude/mcp.json
  .opencode/mcp.json
  board-configs/private/dev-safe-probe.json
  .dev-safe-context-probe.key
  .dev-safe-context-probe.pem
)

cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  "${docker[@]}" image rm "$project-app" "$project-postgres" >/dev/null 2>&1 || true
  for path in "${probe_paths[@]}"; do rm -f -- "$root/$path"; done
  rmdir "$root/board-configs/private" "$root/board-configs" 2>/dev/null || true
}
trap cleanup EXIT

for path in "${probe_paths[@]}"; do
  if [[ -e "$path" ]]; then
    printf 'refusing to overwrite existing private-path probe target: %s\n' "$path" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$path")"
  printf 'DEV_SAFE_PRIVATE_CONTEXT_SENTINEL\n' > "$path"
done

# Build the real application image from the real repository context. The probe
# files are Git-ignored but must still be excluded by Docker's applicable rules.
"${compose[@]}" build app
app_image="$project-app"
"${docker[@]}" run --rm --entrypoint sh "$app_image" -ec '
  test -f /app/src/app/layout.tsx
  test ! -e /app/.claude/mcp.json
  test ! -e /app/.opencode/mcp.json
  test ! -e /app/board-configs/private/dev-safe-probe.json
  test ! -e /app/.dev-safe-context-probe.key
  test ! -e /app/.dev-safe-context-probe.pem
'

# Initialize only the disposable tmpfs-backed database as owner, then seed two
# workspace rows for an RLS read probe. Owner credentials never enter app.
"${compose[@]}" up --detach --build --wait --wait-timeout 180 postgres
"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U allura -d allura_dev <<'SQL'
INSERT INTO workspaces (workspace_id, group_id, name) VALUES
  ('dev-safe-it-a', 'allura-system', 'Dev-safe integration A'),
  ('dev-safe-it-b', 'allura-system', 'Dev-safe integration B')
ON CONFLICT (workspace_id) DO NOTHING;
INSERT INTO inventory_records
  (id, group_id, workspace_id, artifact_type, ecosystem, package, version, hash, publisher, workflow_reference, source_ref, trust_state, freshness_state)
VALUES
  ('visible-a', 'allura-system', 'dev-safe-it-a', 'lockfile', 'bun', 'visible-a', '1', 'sha-a', 'test', 'test', 'test', 'provisional', 'fresh'),
  ('hidden-b', 'allura-system', 'dev-safe-it-b', 'lockfile', 'bun', 'hidden-b', '1', 'sha-b', 'test', 'test', 'test', 'provisional', 'fresh')
ON CONFLICT (group_id, workspace_id, id) DO NOTHING;
SQL

"${compose[@]}" run --rm --no-deps --entrypoint bun app --no-env-file -e '
  import { closePool, getAppPool, getPool } from "./src/lib/postgres/connection.ts";
  if (process.env.POSTGRES_USER !== "allura_app" || process.env.POSTGRES_APP_USER !== "allura_app") throw new Error("app role aliases are not restricted");
  if (process.env.POSTGRES_PASSWORD !== process.env.POSTGRES_APP_PASSWORD) throw new Error("generic and app pools do not share restricted credentials");
  for (const [name, pool] of [["generic", getPool()], ["app", getAppPool()]]) {
    const role = await pool.query("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    const row = role.rows[0];
    if (row.current_user !== "allura_app" || row.rolsuper || row.rolbypassrls) throw new Error(`${name} pool has elevated role: ${JSON.stringify(row)}`);
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config($1, $2, true)", ["app.current_group_id", "allura-system"]);
    await client.query("SELECT set_config($1, $2, true)", ["app.current_workspace_id", "dev-safe-it-a"]);
    const rows = await client.query("SELECT id FROM inventory_records ORDER BY id");
    const ids = rows.rows.map((row) => row.id);
    if (JSON.stringify(ids) !== JSON.stringify(["visible-a"])) throw new Error(`cross-workspace RLS failed: ${JSON.stringify(ids)}`);
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await closePool();
  }
'

# Exercise a real application route whose implementation uses legacy getPool().
# This proves the packaged app can read with the restricted generic credential;
# a missing grant remains a visible HTTP/SQL failure rather than an owner fallback.
"${compose[@]}" up --detach --no-build --wait --wait-timeout 180 app
"${compose[@]}" exec -T app bun --no-env-file -e '
  const response = await fetch("http://127.0.0.1:4002/api/memory/stats?group_id=allura-system");
  const body = await response.text();
  if (!response.ok) throw new Error(`restricted app database read failed (${response.status}): ${body}`);
'

printf 'dev-safe Docker context, app-role, and cross-workspace RLS probes passed\n'
