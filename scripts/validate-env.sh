#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

REQUIRED_VARS=(
    "POSTGRES_PASSWORD:Database password"
    "NEO4J_PASSWORD:Neo4j password"
    "OLLAMA_API_KEY:Ollama API key"
    "RUVIX_KERNEL_SECRET:Secret (min 32 chars)"
)

missing=0
TEMP_ENV=$(mktemp)
trap 'rm -f "$TEMP_ENV"' EXIT

echo "Allura Brain Environment Validator (v2.2.0)"
echo "Checking env files..."

for envfile in .env.local .env; do
    if [[ -f "$REPO_ROOT/$envfile" ]]; then
        echo "  Found: $envfile"
        while IFS= read -r line || [[ -n "$line" ]]; do
            [[ -z "$line" ]] && continue
            [[ "$line" == \#* ]] && continue
            if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
                key="${line%%=*}"
                value="${line#*=}"
                [[ -z "$key" ]] && continue
                echo "${key}=${value}" >> "$TEMP_ENV"
            fi
        done < "$REPO_ROOT/$envfile"
    fi
done

if [[ ! -s "$TEMP_ENV" ]]; then
    echo "FAIL: No env files found"
    exit 1
fi

echo ""
echo "Validating required variables..."

while IFS='=' read -r var value; do
    export "$var"="$value"
done < "$TEMP_ENV"

for entry in "${REQUIRED_VARS[@]}"; do
    IFS=':' read -r var comment <<< "$entry"
    value="${!var:-}"
    
    if [[ -z "$value" ]]; then
        echo "  MISSING: $var"
        missing=$((missing + 1))
    else
        if [[ "$var" == "RUVIX_KERNEL_SECRET" && ${#value} -lt 32 ]]; then
            echo "  TOO_SHORT: $var (got ${#value}, need 32+)"
            missing=$((missing + 1))
        else
            echo "  OK: $var"
        fi
    fi
done

if [[ $missing -gt 0 ]]; then
    echo ""
    echo "FAIL: $missing variable(s) missing"
    exit 1
fi

echo ""
echo "PASS: All variables present"
echo ""
echo "Run: docker compose build --no-cache mcp"
echo "Then: docker compose up -d"
