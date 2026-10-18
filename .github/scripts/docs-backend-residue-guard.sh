#!/usr/bin/env bash
# docs-backend-residue-guard.sh — Story 24.8 AC-9
#
# Fails the build when ACTIVE canonical docs or runtime descriptions still
# reference retired graph backends (Neo4j) as if they were current.
#
# Why this exists: the Neo4j sunset (Epic 23, 2026-07-17) removed the graph
# backend from the runtime, but active docs continued to describe "Neo4j
# semantic promotion", "GRAPH_BACKEND=neo4j fallback", and "promotes to Neo4j"
# as current behavior. A reader following those docs would look for a store
# that no longer exists. This gate makes that drift loud.
#
# Historical records in docs/archive stay untouched. Active surfaces (including
# decision logs and fenced diagrams) need explicit retirement/history context on
# each mention, not a document-wide disclaimer. Also catch corrupted identifiers
# and retirement claims produced by blindly replacing Neo4j with PostgreSQL.
#
# Optional local Notion Markdown/text exports receive the same content checks:
#   bash .github/scripts/docs-backend-residue-guard.sh --notion-snapshot PATH
# Repeat the option for multiple files/directories. This never fetches or writes
# Notion. Export links are not repository links and are not checked here.
# Requires python3 for the single-pass content scan; link checks remain below.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATUS=0

# Active surfaces that must describe only the current PostgreSQL/RuVector
# architecture. Historical records live under docs/archive/** and are excluded.
ACTIVE_DOCS=(
  "$ROOT/docs/allura"
  "$ROOT/docs/enterprise"
  "$ROOT/docs/portfolio"
  "$ROOT/README.md"
)
# Runtime description surfaces — scanned for residue in markdown/config only.
# Kept narrow so the guard stays fast; deep scans belong to the canonical guard.
RUNTIME_SURFACES=(
  "$ROOT/.opencode/agent"
  "$ROOT/.claude/agents"
  "$ROOT/.codex/agents"
  "$ROOT/.opencode/context/project-intelligence/technical-domain.md"
  "$ROOT/.opencode/context/project-intelligence/living-notes.md"
  "$ROOT/.agents"
)

SNAPSHOTS=()
DOCS_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --notion-snapshot)
      if [[ $# -lt 2 || ! -e "$2" ]]; then
        echo "ERROR: --notion-snapshot requires an existing Markdown/text file or directory" >&2
        exit 2
      fi
      SNAPSHOTS+=("$2")
      shift 2
      ;;
    --docs-only) DOCS_ONLY=1; shift ;;
    --help)
      echo "Usage: $0 [--docs-only] [--notion-snapshot PATH ...]"
      echo "Scan active repository docs and optional local Notion .md/.txt exports; no network access."
      exit 0
      ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

FILES=()
for path in "${ACTIVE_DOCS[@]}"; do
  if [[ -d "$path" ]]; then
    while IFS= read -r -d '' file; do FILES+=("$file"); done < <(find "$path" -name '*.md' -print0)
  elif [[ -f "$path" ]]; then
    FILES+=("$path")
  fi
done
if [[ "$DOCS_ONLY" -eq 0 ]]; then
  [[ ! -f "$ROOT/AGENTS.md" ]] || FILES+=("$ROOT/AGENTS.md")
for path in "${RUNTIME_SURFACES[@]}"; do
  # Ignore vendored, untracked agent files. Resolve tracked paths against ROOT
  # so invocation from a repository subdirectory scans the same surfaces.
  while IFS= read -r -d '' file; do
    case "$file" in
      *.md|*.json|*.toml|*.yaml|*.yml) FILES+=("$ROOT/$file") ;;
    esac
  done < <(git -C "$ROOT" ls-files -z -- "$path")
done
fi
SNAPSHOT_FILES=()
for path in "${SNAPSHOTS[@]}"; do
  if [[ -d "$path" ]]; then
    count=${#SNAPSHOT_FILES[@]}
    while IFS= read -r -d '' file; do SNAPSHOT_FILES+=("$file"); done < <(find "$path" -type f \( -name '*.md' -o -name '*.txt' \) -print0)
    if [[ ${#SNAPSHOT_FILES[@]} -eq $count ]]; then
      echo "ERROR: Notion snapshot directory has no .md/.txt files: $path" >&2
      exit 2
    fi
  else
    case "$path" in
      *.md|*.txt) SNAPSHOT_FILES+=("$path") ;;
      *) echo "ERROR: Notion snapshot must be .md or .txt: $path" >&2; exit 2 ;;
    esac
  fi
done

if [[ "$DOCS_ONLY" -eq 1 ]]; then
  echo "docs-backend-residue-guard: checking active docs + ${#SNAPSHOTS[@]} local Notion snapshot inputs (runtime descriptions excluded by --docs-only)"
else
  echo "docs-backend-residue-guard: checking active docs + runtime surfaces + ${#SNAPSHOTS[@]} local Notion snapshot inputs"
fi

python3 - "$ROOT" "${#FILES[@]}" "${FILES[@]}" "${SNAPSHOT_FILES[@]}" <<'PYTHON' || STATUS=1
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
repo_count = int(sys.argv[2])
snapshots = {Path(arg).resolve() for arg in sys.argv[3 + repo_count:]}
# Only explicitly exported Notion snapshots may preserve a whole historical
# block. A closed, exact marker is required; arbitrary <details> are still live.
archive = re.compile(
    r"(?ms)^<details>\s*\n<summary>Historical snapshot — [^\n<>]+ — not current specification</summary>\s*\n"
    r"(?:(?!^<details>|^</details>).)*^</details>[ \t]*(?=\n|$)"
)
# Case-insensitive substring deliberately includes Neo4jGraphAdapter,
# NEO4J_MEMORY, neo4j-memory, paths, and Mermaid participants.
neo4j = re.compile(r"neo4j", re.I)
pg = r"PostgreSQL\s*\(graph_memories\)"
corruption = re.compile(
    rf"{pg}(?:GraphAdapter|_id|/)|(?:src|scripts)/[^`\n]*{pg}"
    r"|(?:src|scripts)/[^`\n]*PostgreSQL\s+(?:semantic|graph)\s+tables/"
    rf"|{pg}[^.;\n]{{0,55}}(?:sunset|retired|removed|container.*stopped|Community|fallback)"
    rf"|(?:sunset|retiring|replacing|replaced|replace)\s+{pg}"
    rf"|GRAPH_BACKEND(?:\s*=\s*[`\"]?|[^|.\n]{{0,50}}\bdefault(?:s)?\s+to\s+[`\"]?){pg}"
    rf"|(?:[`\"]graph_backend[`\"]|Target graph adapter)[^\n]{{0,100}}{pg}"
    rf"|[`\"]{pg}[`\"]\s*\|",
    re.I,
)
# Explicit row/line history is allowed, but an AD number, 'decision', 'migration',
# or a historical heading never exempts the subsequent body/diagram.
historical = re.compile(
    r"^\s*(?:[-*>#]+\s*)?(?:historical|superseded)(?:\s|[:(])"
    r"|\|\s*(?:\*\*)?(?:historical|superseded by)\b"
    r"|—\s*(?:Historical|Superseded)[.:]",
    re.I,
)
retirement = re.compile(
    r"neo4j(?:\s+fallback|\s+backend|\s+\d+(?:\.\d+)*)?\s+"
    r"(?:(?:is|was|has been)\s+)?(?:permanently\s+)?(?:sunset|removed|retired|replaced|no longer|rejected)\b"
    r"|(?:sunset|removed|retired|retiring|replaced|replace|replaces|replacing)\s+(?:the\s+)?(?:legacy\s+)?neo4j\b"
    r"|migrated\s+from\s+neo4j\b"
    r"|retirement decision for\s+neo4j\b"
    r"|removes? the per-person\s+neo4j Community license limit\b"
    r"|no\s+neo4j\s+(?:dependency|dependencies|backend|fallback)\b"
    r"|no\s+direct\s+neo4j\s+writes\b"
    r"|neo4j\s+(?:bolt|http)\s*\|\s*\d+\s*\|[^|\n]*—\s*retired\b"
    r"|historical neo4j\s*→\s*PostgreSQL migration"
    r"|historical neo4j selector is rejected"
    r'|"neo4j_(?:id|deprecated)"\s*:\s*(?:"[^"\n]*"|true|false|null)\s*,?\s*// historical compatibility (?:key|example)'
    r"|legacy [^.;\n]{0,100}neo4j-tool[^.;\n]{0,100}claims below are historical/reconciliation debt"
    r"|neo4j[^;|.\n]{0,60}\b(?:retired|removed|replaced)\b",
    re.I,
)
# Bounded contract assertions: match a promotion action plus review bypass,
# or a memory/search/retrieval operation claiming multiple durable stores.
# Historical rows are evidence; negated actions are prohibitions, not promises.
promotion_bypass = re.compile(
    r"\b(?:auto[- ]promot(?:e[sd]?|ion|ing)|automatically promot(?:e[sd]?|ing))\b"
    r"[^.;|\n]{0,160}\bwithout\s+(?:any\s+)?(?:human|curator)(?:\s+or\s+(?:human|curator))?"
    r"\s+(?:review|approval)\b", re.I,
)
multiple_stores = re.compile(
    r"\b(?:memor(?:y|ies)\s+(?:flow|pass|move)s?|(?:semantic\s+)?search|retrieval)\b"
    r"[^.;|\n]{0,240}\b(?:two|both|dual)\s+stores\b", re.I,
)
prohibition = re.compile(r"\b(?:never|cannot|must not|do not|does not|should not|no longer)\s*$", re.I)
negated_operation = re.compile(r"\b(?:never|cannot|must not|do not|does not|should not|no longer)\b", re.I)


def contract_drift(context):
    for clause in re.split(r";|\.\s+|\bbut\b", context):
        if historical.search(clause):
            continue
        for match in promotion_bypass.finditer(clause):
            if not prohibition.search(clause[:match.start()]):
                return "promotion contract bypasses required human review"
        for match in multiple_stores.finditer(clause):
            if not prohibition.search(clause[:match.start()]) and not negated_operation.search(match.group()):
                return "memory/search contract describes multiple stores as current"
    return None


# A persona's skill inventory does not claim a runtime backend. Limit this to
# the known metadata capability list, not arbitrary prose containing 'expert'.
def unqualified(clause):
    spans = [match.span() for match in retirement.finditer(clause)]
    return any(not any(start <= match.start() < end for start, end in spans)
               for match in neo4j.finditer(clause))

status = 0
for file in sorted(set(Path(arg).resolve() for arg in sys.argv[3:])):
    try:
        body = file.read_text(encoding="utf-8")
        if file in snapshots:
            blocks = list(archive.finditer(body))
            for block in blocks:
                start = body.count("\n", 0, block.start()) + 1
                print(f"HISTORICAL EXCLUSION: {file}:{start} — explicitly archived Notion snapshot")
            body = archive.sub(lambda match: "\n" * match.group().count("\n"), body)
            if "<summary>Historical snapshot —" in body:
                print(f"ERROR: {file} — malformed or unclosed historical snapshot block")
                status = 1
        lines = body.splitlines()
    except (OSError, UnicodeError) as error:
        print(f"ERROR: cannot read {file}: {error}")
        status = 1
        continue
    label = str(file.relative_to(root)) if file.is_relative_to(root) else str(file)
    for number, line in enumerate(lines, 1):
        context = re.sub(r"[*`]", "", line)
        reason = contract_drift(context)
        if corruption.search(line):
            reason = "corrupted PostgreSQL identifier or retirement/backend claim"
        elif neo4j.search(line):
            # Join only an unfinished retirement verb, never borrow a whole
            # neighboring line's historical exemption for an active claim.
            if re.match(r"^description\s*[:=]", context):
                context = context.replace("PostgreSQL, Neo4j, query optimization, data migration.",
                                          "PostgreSQL, graph databases, query optimization, data migration.")
            if re.search(r"neo4j\s+(?:was|is|has been)\s*$", context, re.I) and number < len(lines):
                context += " " + lines[number].strip()
            # A history marker covers only its clause, not later current claims.
            clauses = re.split(r";|\.\s+|\bbut\b", context)
            if any(not historical.search(clause) and unqualified(clause) for clause in clauses):
                reason = "retired backend described as current (or missing explicit historical context)"
        if reason:
            print(f"ERROR: {label}:{number} — {reason}\n       Line: {line}")
            status = 1
sys.exit(status)
PYTHON

# ── Internal link + evidence resolution check (Story 24.8 AC-9) ─────────────
# Fails when an ACTIVE doc links to a missing internal markdown file, or when
# a capability-matrix evidence link does not resolve. Relative links only;
# http(s) links and anchors are out of scope for this guard.
#
# Coverage (DW-2 triage 2026-08-29): inline links, links with titles, and
# reference-style links `[label]: path` are checked. Fenced code blocks are
# stripped before scanning so code samples never produce false positives.
# Multi-line inline links (target on the next line) remain unchecked.
check_links() {
  local file="$1"
  local rel="${file#"$ROOT"/}"
  local dir
  dir="$(dirname "$file")"
  local target

  # Strip fenced code blocks (``` or ~~~) so examples never trip the check,
  # then strip inline code spans (`...`) — links inside code spans are
  # examples/regexes, not real links.
  local body
  body="$(sed -E '/^(```|~~~)/,/^(```|~~~)$/d' "$file" | sed -E 's/`[^`]*`//g')"

  # Extract link targets, handling markdown titles `](url "title")` and
  # nested parens by taking the first balanced-paren group after `](`.
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    # Skip anchors, http(s), mailto, and code spans
    case "$target" in
      \#*|http://*|https://*|mailto:*|*'`'*) continue ;;
    esac
    # Skip regex-looking targets (e.g. `[a-z0-9-]*[a-z0-9]` inside code spans)
    case "$target" in
      *'['*|*']'*|*'*'*) continue ;;
    esac
    # Strip any anchor fragment
    local path="${target%%#*}"
    [[ -z "$path" ]] && continue
    if [[ ! -e "$dir/$path" ]]; then
      echo "ERROR: $rel — broken internal link: $target"
      STATUS=1
    fi
  done < <(grep -oE '\]\([^)]*\)' <<< "$body" | sed -E 's/^\]\(//; s/\)$//; s/ "[^"]*"$//')

  # Reference-style definitions: `[label]: path` — resolve the path.
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    case "$target" in
      \#*|http://*|https://*|mailto:*|*'`'*|*'['*|*']'*|*'*'*) continue ;;
    esac
    local path="${target%%#*}"
    [[ -z "$path" ]] && continue
    if [[ ! -e "$dir/$path" ]]; then
      echo "ERROR: $rel — broken reference link: $target"
      STATUS=1
    fi
  done < <(grep -oE '^\[[^]]+\]:[[:space:]]*[^[:space:]]+' <<< "$body" | sed -E 's/^\[[^]]+\]:[[:space:]]*//')
}

for dir in "${ACTIVE_DOCS[@]}"; do
  if [[ -d "$dir" ]]; then
    while IFS= read -r file; do
      check_links "$file"
    done < <(find "$dir" -name '*.md' -print | sort)
  elif [[ -f "$dir" ]]; then
    check_links "$dir"
  fi
done

if [[ "$STATUS" -ne 0 ]]; then
  echo "docs-backend-residue-guard: FAILED — active docs contain backend/approval contract drift, corrupted identifiers, or broken internal links"
  exit "$STATUS"
fi

echo "docs-backend-residue-guard: OK — no backend/approval contract drift or corrupted identifiers in scanned surfaces; inline, titled, and reference-style internal links resolve (fenced code stripped; multi-line inline links unchecked)"
