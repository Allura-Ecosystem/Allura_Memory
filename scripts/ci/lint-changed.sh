#!/usr/bin/env bash
set -Eeuo pipefail

base_sha="${CI_LINT_BASE_SHA:-}"
report_path=""
for arg in "$@"; do
  case "$arg" in
    --base=*) base_sha="${arg#*=}" ;;
    --report=*) report_path="${arg#*=}" ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 64 ;;
  esac
done

if [[ -z "$base_sha" ]]; then
  printf 'A base commit is required via --base=<sha> or CI_LINT_BASE_SHA.\n' >&2
  exit 64
fi

if ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  printf 'Base commit is not available or invalid: %s\n' "$base_sha" >&2
  exit 65
fi

mapfile -d '' changed_files < <(
  git diff --name-only --diff-filter=ACMR -z "$base_sha" HEAD -- \
    '*.js' '*.jsx' '*.ts' '*.tsx' '*.mjs' '*.cjs'
)

if [[ "${#changed_files[@]}" -eq 0 ]]; then
  printf 'No changed JavaScript or TypeScript files between %s and HEAD.\n' "$base_sha"
  exit 0
fi

printf 'Linting %s changed JavaScript/TypeScript file(s) against base %s.\n' \
  "${#changed_files[@]}" "$base_sha"
report_args=()
if [[ -n "$report_path" ]]; then
  report_args=(--format=json --output-file "$report_path")
fi
bun eslint --no-warn-ignored "${report_args[@]}" "${changed_files[@]}"
