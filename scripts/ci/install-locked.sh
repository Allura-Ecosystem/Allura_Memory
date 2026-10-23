#!/usr/bin/env bash
set -Eeuo pipefail

# Run from the repository root. No lifecycle changes, upgrades or lock rewrites.
expected_node="$(tr -d '\r\n' < .node-version)"
expected_bun="$(node -p 'require("./package.json").packageManager.replace(/^bun@/, "")')"
actual_node="$(node --version)"
actual_bun="$(bun --version)"
[[ "$actual_node" == "v${expected_node}" ]] || { printf 'Node mismatch: %s (expected %s)\n' "$actual_node" "$expected_node" >&2; exit 65; }
[[ "$actual_bun" == "$expected_bun" ]] || { printf 'Bun mismatch: %s (expected %s)\n' "$actual_bun" "$expected_bun" >&2; exit 65; }
printf 'Node %s (%s); Bun %s (%s)\n' "$actual_node" "$(command -v node)" "$actual_bun" "$(command -v bun)"
lock_before="$(sha256sum bun.lock)"
printf 'Lock before install: %s\n' "$lock_before"
bun install --frozen-lockfile
lock_after="$(sha256sum bun.lock)"
printf 'Lock after install: %s\n' "$lock_after"
[[ "$lock_before" == "$lock_after" ]] || { printf 'Frozen install changed bun.lock\n' >&2; exit 65; }
git diff --exit-code -- bun.lock
