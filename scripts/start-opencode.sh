#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

read_env_value() {
  python3 - "$ENV_FILE" "$1" <<'PY'
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
key = sys.argv[2]

for raw_line in env_path.read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    lhs, rhs = line.split('=', 1)
    if lhs.strip() != key:
        continue
    value = rhs.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    print(value)
    break
PY
}

if [ ! -f "$ENV_FILE" ]; then
  printf 'Error: %s not found\n' "$ENV_FILE" >&2
  exit 1
fi

export POSTGRES_PASSWORD="$(read_env_value POSTGRES_PASSWORD)"

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  printf 'Error: POSTGRES_PASSWORD is not set after loading .env\n' >&2
  exit 1
fi

cd "$REPO_ROOT"
exec opencode "$@"
