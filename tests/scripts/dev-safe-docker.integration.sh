#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

: "${ALLURA_DEV_SAFE_DOCKER_ENDPOINT:=unix:///var/run/docker.sock}"
: "${ALLURA_DEV_SAFE_DASHBOARD_PORT:=4002}"
export ALLURA_DEV_SAFE_DASHBOARD_PORT
project="allura-dev-safe-it-$$-${RANDOM}"
probe_paths=(
  .claude/mcp.json
  .opencode/mcp.json
  board-configs/private/dev-safe-probe.json
  .dev-safe-context-probe.key
  .dev-safe-context-probe.pem
)
probe_directories=(
  .claude
  .opencode
  board-configs
  board-configs/private
)

# Refuse every pre-existing sentinel before installing traps, validating Docker,
# creating directories, or performing any other mutation.
conflicts=()
for path in "${probe_paths[@]}"; do
  if [[ -e "$root/$path" || -L "$root/$path" ]]; then
    conflicts+=("$path")
  fi
done
if ((${#conflicts[@]})); then
  printf 'refusing to overwrite existing private-path probe target: %s\n' "${conflicts[@]}" >&2
  exit 1
fi

# Existing parents may be reused, but never follow a symlink or replace a
# non-directory while preparing the owned fixture tree.
for path in "${probe_directories[@]}"; do
  if [[ -e "$root/$path" || -L "$root/$path" ]]; then
    if [[ ! -d "$root/$path" || -L "$root/$path" ]]; then
      printf 'refusing unsafe private-path probe parent: %s\n' "$path" >&2
      exit 1
    fi
  fi
done

# Reuse the launcher's implementation verbatim: trusted Unix account lookup,
# approved local Unix sockets, parent-symlink checks, socket type, and owner UID.
bun_executable="$(command -v bun)"
boundary="$($bun_executable --no-env-file "$root/scripts/dev-safe/inspect-docker-endpoint.ts")"
IFS=$'\t' read -r docker_executable docker_endpoint extra <<<"$boundary"
if [[ -z "$docker_executable" || -z "$docker_endpoint" || -n "${extra:-}" ]]; then
  printf 'invalid dev-safe Docker boundary result\n' >&2
  exit 1
fi
docker=("$docker_executable" --host "$docker_endpoint")
compose=("${docker[@]}" compose --project-name "$project" --project-directory "$root" --env-file /dev/null --file "$root/docker-compose.dev-safe.yml")

# A random project name makes collisions unlikely; this read-only preflight makes
# refusal deterministic and guarantees cleanup never adopts existing resources.
resource_conflicts=()
for image in "$project-app" "$project-postgres"; do
  image_matches="$("${docker[@]}" image ls --quiet --filter "reference=$image")"
  if [[ -n "$image_matches" ]]; then
    resource_conflicts+=("image:$image")
  fi
done
container_matches="$("${docker[@]}" ps -aq --filter "label=com.docker.compose.project=$project")"
network_matches="$("${docker[@]}" network ls -q --filter "label=com.docker.compose.project=$project")"
volume_matches="$("${docker[@]}" volume ls -q --filter "label=com.docker.compose.project=$project")"
while IFS= read -r resource; do [[ -n "$resource" ]] && resource_conflicts+=("container:$resource"); done <<<"$container_matches"
while IFS= read -r resource; do [[ -n "$resource" ]] && resource_conflicts+=("network:$resource"); done <<<"$network_matches"
while IFS= read -r resource; do [[ -n "$resource" ]] && resource_conflicts+=("volume:$resource"); done <<<"$volume_matches"
if ((${#resource_conflicts[@]})); then
  printf 'refusing to adopt existing Docker resource: %s\n' "${resource_conflicts[@]}" >&2
  exit 1
fi

created_files=()
created_directories=()
compose_owned=false
app_image_owned=false
postgres_image_owned=false
ownership_change=false
pending_signal=0
handle_signal() {
  local signal_status="$1"
  if [[ "$ownership_change" == true ]]; then
    pending_signal="$signal_status"
    return
  fi
  exit "$signal_status"
}
finish_ownership_change() {
  ownership_change=false
  if ((pending_signal)); then exit "$pending_signal"; fi
}
cleanup() {
  local original_status="$1"
  local cleanup_failed=false
  trap - EXIT INT TERM
  set +e
  if [[ "$compose_owned" == true ]]; then
    "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || cleanup_failed=true
  fi
  owned_images=()
  [[ "$app_image_owned" == true ]] && owned_images+=("$project-app")
  [[ "$postgres_image_owned" == true ]] && owned_images+=("$project-postgres")
  if ((${#owned_images[@]})); then
    "${docker[@]}" image rm "${owned_images[@]}" >/dev/null 2>&1 || cleanup_failed=true
  fi
  for path in "${created_files[@]}"; do rm -f -- "$path" || cleanup_failed=true; done
  for ((index=${#created_directories[@]}-1; index>=0; index--)); do
    rmdir -- "${created_directories[index]}" 2>/dev/null || cleanup_failed=true
  done
  if [[ "$compose_owned" == true ]]; then
    if ! remaining="$("${docker[@]}" ps -aq --filter "label=com.docker.compose.project=$project")"; then cleanup_failed=true
    elif [[ -n "$remaining" ]]; then cleanup_failed=true; fi
    if ! remaining="$("${docker[@]}" network ls -q --filter "label=com.docker.compose.project=$project")"; then cleanup_failed=true
    elif [[ -n "$remaining" ]]; then cleanup_failed=true; fi
    if ! remaining="$("${docker[@]}" volume ls -q --filter "label=com.docker.compose.project=$project")"; then cleanup_failed=true
    elif [[ -n "$remaining" ]]; then cleanup_failed=true; fi
  fi
  for image in "${owned_images[@]}"; do
    if ! remaining="$("${docker[@]}" image ls --quiet --filter "reference=$image")"; then cleanup_failed=true
    elif [[ -n "$remaining" ]]; then cleanup_failed=true; fi
  done
  for path in "${created_files[@]}"; do [[ ! -e "$path" && ! -L "$path" ]] || cleanup_failed=true; done
  for path in "${created_directories[@]}"; do [[ ! -e "$path" && ! -L "$path" ]] || cleanup_failed=true; done
  if [[ "$cleanup_failed" == true ]]; then
    printf 'dev-safe Docker integration cleanup failed for owned project %s\n' "$project" >&2
    return 1
  fi
  return "$original_status"
}
trap 'status=$?; cleanup "$status"; exit $?' EXIT
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

for path in "${probe_directories[@]}"; do
  if [[ ! -d "$root/$path" ]]; then
    ownership_change=true
    mkdir -- "$root/$path"
    created_directories+=("$root/$path")
    finish_ownership_change
  fi
done
for path in "${probe_paths[@]}"; do
  ownership_change=true
  set -o noclobber
  if ! exec {probe_fd}> "$root/$path"; then
    set +o noclobber
    ownership_change=false
    printf 'refusing raced private-path probe target: %s\n' "$path" >&2
    exit 1
  fi
  set +o noclobber
  created_files+=("$root/$path")
  printf 'DEV_SAFE_PRIVATE_CONTEXT_SENTINEL\n' >&"$probe_fd"
  exec {probe_fd}>&-
  finish_ownership_change
done

# Build the real application image from the real repository context. The probe
# files are Git-ignored but must still be excluded by Docker's applicable rules.
app_image_owned=true
"${compose[@]}" build app
app_image="$project-app"
app_image_id="$("${docker[@]}" image inspect --format '{{.Id}}' "$app_image")"
[[ "$app_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || { printf 'invalid app image content hash: %s\n' "$app_image_id" >&2; exit 1; }
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
compose_owned=true
postgres_image_owned=true
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
    const rows = await client.query("SELECT id, hash FROM inventory_records ORDER BY id");
    if (JSON.stringify(rows.rows) !== JSON.stringify([{ id: "visible-a", hash: "sha-a" }])) throw new Error(`cross-workspace RLS/hash failed: ${JSON.stringify(rows.rows)}`);
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await closePool();
  }
'

# Exercise a real application route whose implementation uses legacy getPool().
# Validate the response contract as well as status so an error-shaped 2xx fails.
"${compose[@]}" up --detach --no-build --wait --wait-timeout 180 app
"${compose[@]}" exec -T app bun --no-env-file -e '
  const response = await fetch("http://127.0.0.1:4002/api/memory/stats?group_id=allura-system");
  const body = await response.text();
  if (!response.ok) throw new Error(`restricted app database read failed (${response.status}): ${body}`);
  const parsed = JSON.parse(body);
  for (const key of ["episodic_count", "semantic_count", "search_count", "total_count"]) {
    if (!Number.isInteger(parsed[key]) || parsed[key] < 0) throw new Error(`invalid HTTP stats field ${key}: ${body}`);
  }
  if (parsed.last_activity !== null && typeof parsed.last_activity !== "string") throw new Error(`invalid HTTP last_activity: ${body}`);
  if (Object.keys(parsed).sort().join(",") !== "episodic_count,last_activity,search_count,semantic_count,total_count") throw new Error(`unexpected HTTP stats shape: ${body}`);
'

printf 'dev-safe Docker context, image hash, app-role, cross-workspace RLS, and HTTP content probes passed\n'
