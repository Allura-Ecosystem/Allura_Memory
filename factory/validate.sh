#!/usr/bin/env bash
set -euo pipefail

# validate.sh — Allura Agent Factory validation gate
# Usage: ./validate.sh <team-directory>
# Example: ./validate.sh factory/teams/penasoto

TEAM_DIR="${1:-}"
PASS=0
FAIL=0

red() { printf "\e[31m%s\e[0m\n" "$*"; }
green() { printf "\e[32m%s\e[0m\n" "$*"; }
yellow() { printf "\e[33m%s\e[0m\n" "$*"; }

check() {
    local name="$1"
    local result="$2"
    if [ "$result" = "pass" ]; then
        green "  ✓ $name"
        PASS=$((PASS + 1))
    else
        red "  ✗ $name"
        FAIL=$((FAIL + 1))
    fi
}

yaml_value() {
    local file="$1"
    local key="$2"
    bun -e '
      import { readFileSync } from "node:fs";
      import { parse } from "yaml";
      const data = parse(readFileSync(process.argv[1], "utf8"));
      const value = data?.[process.argv[2]];
      if (Array.isArray(value)) console.log(value.join("\n"));
      else if (value !== undefined && value !== null) console.log(String(value));
    ' "$file" "$key"
}

echo ""
yellow "═══════════════════════════════════════════"
yellow "  Allura Agent Factory — Validation Gate"
yellow "═══════════════════════════════════════════"
echo ""

if [ -z "$TEAM_DIR" ] || [ ! -d "$TEAM_DIR" ]; then
    red "ERROR: Provide a valid team directory"
    echo "Usage: $0 <team-directory>"
    echo "Example: $0 teams/penasoto"
    exit 1
fi

TEAM_NAME=$(basename "$TEAM_DIR")
echo "Team: $TEAM_NAME"
echo ""

# ── STRUCTURE CHECKS ──────────────────────────────────────────────────────
echo "── Structure ──"

check "team.yaml exists" "$([ -f "$TEAM_DIR/team.yaml" ] && echo "pass" || echo "fail")"
check "overlay.yaml exists" "$([ -f "$TEAM_DIR/overlay.yaml" ] && echo "pass" || echo "fail")"
check "agents/ directory exists" "$([ -d "$TEAM_DIR/agents" ] && echo "pass" || echo "fail")"
check "agents/ directory not empty" "$([ -d "$TEAM_DIR/agents" ] && ls "$TEAM_DIR/agents/"*.md &>/dev/null && echo "pass" || echo "fail")"

# ── YAML VALIDITY ──────────────────────────────────────────────────────────
echo ""
echo "── YAML Validity ──"

if command -v bun &>/dev/null; then
    for f in "$TEAM_DIR/team.yaml" "$TEAM_DIR/overlay.yaml"; do
        if [ -f "$f" ]; then
            bun -e 'import { readFileSync } from "node:fs"; import { parse } from "yaml"; parse(readFileSync(process.argv[1], "utf8"));' "$f" 2>/dev/null \
                && check "$(basename $f) is valid YAML" "pass" \
                || check "$(basename $f) is valid YAML" "fail"
        fi
    done
else
    red "  ✗ bun is required for deterministic YAML validation"
    exit 1
fi

# ── MANIFEST CONTRACT ──────────────────────────────────────────────────────
echo ""
echo "── Manifest Contract ──"

manifest="$TEAM_DIR/team.yaml"
overlay="$TEAM_DIR/overlay.yaml"
if [ -f "$manifest" ] && [ -f "$overlay" ]; then
    manifest_group=$(yaml_value "$manifest" "group_id")
    overlay_group=$(yaml_value "$overlay" "group_id")
    check "manifest group_id uses allura-* namespace" "$([[ "$manifest_group" =~ ^allura-[a-z0-9-]+$ ]] && echo "pass" || echo "fail")"
    check "overlay group_id matches manifest" "$([ "$manifest_group" = "$overlay_group" ] && echo "pass" || echo "fail")"

    mapfile -t manifest_agents < <(yaml_value "$manifest" "agents" | sort)
    mapfile -t file_agents < <(find "$TEAM_DIR/agents" -maxdepth 1 -type f -name '*.md' -printf '%f\n' | sed 's/\.md$//' | sort)
    check "manifest roster matches agents/*.md" "$([ "${manifest_agents[*]}" = "${file_agents[*]}" ] && echo "pass" || echo "fail")"

    dependency_check=$(bun -e '
      import { readFileSync } from "node:fs";
      import { parse } from "yaml";
      const data = parse(readFileSync(process.argv[1], "utf8"));
      const deps = data?.bmad?.dependencies ?? [];
      process.exit(
        deps.some((d) => String(d).startsWith("allura-memory-skill@")) &&
        deps.some((d) => String(d).startsWith("bmad-core@")) ? 0 : 1
      );
    ' "$manifest" && echo "pass" || echo "fail")
    check "BMad and Allura dependencies declared" "$dependency_check"
fi

# ── ALLURA GATES ──────────────────────────────────────────────────────────
echo ""
echo "── Allura Governance Gates ──"

for agent_file in "$TEAM_DIR/agents/"*.md; do
    [ -f "$agent_file" ] || continue
    AGENT=$(basename "$agent_file" .md)
    content=$(cat "$agent_file")

    # Check group_id
    if echo "$content" | grep -q "group_id:"; then
        check "$AGENT: group_id present" "pass"
    else
        check "$AGENT: group_id present" "fail"
    fi

    if echo "$content" | grep -q "group_id:.*$manifest_group"; then
        check "$AGENT: group_id matches manifest" "pass"
    else
        check "$AGENT: group_id matches manifest" "fail"
    fi

    # Check user_id
    if echo "$content" | grep -q "user_id:"; then
        check "$AGENT: user_id present" "pass"
    else
        check "$AGENT: user_id present" "fail"
    fi

    # Check allura-memory-skill
    if echo "$content" | grep -qi "allura-memory-skill"; then
        check "$AGENT: allura-memory-skill" "pass"
    else
        check "$AGENT: allura-memory-skill" "fail"
    fi

    # Check governance keywords
    for keyword in "append-only" "SUPERSEDES" "HITL"; do
        if echo "$content" | grep -qi "$keyword"; then
            check "$AGENT: '$keyword' present" "pass"
        else
            check "$AGENT: '$keyword' present" "fail"
        fi
    done
done

# ── OVERLAY CHECKS ─────────────────────────────────────────────────────────
echo ""
echo "── Overlay Checks ──"

overlay="$TEAM_DIR/overlay.yaml"
if [ -f "$overlay" ]; then
    for keyword in "activation_steps_prepend" "persistent_facts" "activation_steps_append" "group_id_enforcement" "append_only" "supersedes_versioning" "hitl_required"; do
        if grep -q "$keyword" "$overlay"; then
            check "overlay: '$keyword'" "pass"
        else
            check "overlay: '$keyword'" "fail"
        fi
    done
fi

# ── SUMMARY ────────────────────────────────────────────────────────────────
echo ""
yellow "═══════════════════════════════════════════"
total=$((PASS + FAIL))
green "  Passed: $PASS"
red "  Failed: $FAIL"
if [ $FAIL -eq 0 ]; then
    green "  ✓ ALL GATES PASSED"
else
    red "  ✗ GATES FAILED — review above"
fi
yellow "═══════════════════════════════════════════"
echo ""

if [ "$FAIL" -eq 0 ]; then
    exit 0
fi
exit 1
