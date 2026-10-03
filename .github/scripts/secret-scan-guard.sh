#!/usr/bin/env bash
# Fails the build if a live credential is committed to the tracked tree.
#
# Why this exists: a Context7 bearer token was committed in .claude/settings.json
# and reached the GitHub remote in 79de855d. Nothing caught it — .env and .env.local
# are gitignored, so the team's mental model was "secrets live in .env", while a
# tracked config file quietly carried a live key. Scrubbing the working file does
# not remove a secret from history; the only remedy is revocation at the issuer.
# This gate makes the next one loud before it lands.
#
# See RISKS-AND-DECISIONS.md AD-56 and the token strategy: secrets belong in the
# secret manager, referenced from config as ${VAR}, never as literals.
set -uo pipefail

# Each entry: "<label>|<extended regex>"
PATTERNS=(
  "Context7 API key|ctx7sk-[A-Za-z0-9_-]{8,}"
  "Allura MCP token|allura_mcp_[A-Za-z0-9_-]{20,}"  # fixtures filtered below
  "OpenAI-style secret key|sk-[A-Za-z0-9]{32,}"
  "GitHub token|gh[pousr]_[A-Za-z0-9]{20,}"
  "AWS access key id|AKIA[0-9A-Z]{16}"
  "Private key block|-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"
)

# Postgres DSNs carrying credentials, excluding the documented CI test database
# (postgresql://allura:allura@localhost) which is a fixture, not a secret.
DSN_PATTERN='postgresql://[^:/@[:space:]]+:[^@[:space:]]+@[^[:space:],;|?]+'
# Documented fixtures and doc examples — not secrets.
DSN_ALLOW='postgresql://(allura|ronin4life):(allura|pass|password|<password>|\*+|\$\{[^}]+\})@(localhost|postgres)(:|/|\?|$)|postgresql://(postgres):(postgres|pass|password|<password>|\*+|\$\{[^}]+\})@(localhost|postgres)(:|/|\?|$)|postgresql://\$\{[^}]+\}:(\*+|\$\{[^}]+\})@\$\{[^}]+\}(:|/|\?|$)'

# Historical records legitimately cite retired credentials; never rewrite history.
# The guard and its workflow contain the patterns by definition.
EXCLUDES=(
  ":(exclude)docs/archive/**"
  ":(exclude).github/scripts/secret-scan-guard.sh"
  ":(exclude).github/workflows/secret-scan-guard.yml"
  ":(exclude)bun.lock"
  ":(exclude)package-lock.json"
  ":(exclude).env.example"
)

status=0

# Safe placeholders are evaluated against each matched token, not whole lines.
# This prevents a safe fixture from hiding a second unsafe credential on the same line.
SAFE_PLACEHOLDERS='\$\{|<password>|<your-|YOUR_|example\.com'
SAFE_ALLURA_FIXTURES='allura_mcp_[a-z]+0{6,}|allura_mcp_device-token-0{12,}|allura_mcp_RAW_SHOULD_NEVER_RENDER'
SAFE_PRIVATE_KEY_FIXTURE_PATHS='^_bmad/bmm/stories/29-(17-credential-leak-scan|21-platform-secure-store-contracts)\.md:|^src/lib/device-pairing/__tests__/audit-redaction\.test\.ts:'

for entry in "${PATTERNS[@]}"; do
  label="${entry%%|*}"
  regex="${entry#*|}"
  echo "==> scanning for: ${label}"
  if hits=$(git grep -nE -e "${regex}" -- . "${EXCLUDES[@]}" 2>/dev/null); then
    safe_regex="${SAFE_PLACEHOLDERS}"
    if [[ "${label}" == "Allura MCP token" ]]; then
      safe_regex="${safe_regex}|${SAFE_ALLURA_FIXTURES}"
    fi
    safe_regex="^(${safe_regex})$"
    real=''
    while IFS= read -r line; do
      if [[ "${label}" == "Private key block" && "${line}" =~ ${SAFE_PRIVATE_KEY_FIXTURE_PATHS} ]]; then
        continue
      fi
      matches=$(printf '%s\n' "${line}" | grep -oE -- "${regex}" || true)
      unsafe=$(printf '%s\n' "${matches}" | grep -vE "${safe_regex}" || true)
      if [[ -n "${unsafe}" ]]; then
        real+="${line}"$'\n'
      fi
    done <<< "${hits}"
    if [[ -n "${real}" ]]; then
      echo "${real}"
      echo "    FAIL: a ${label} appears to be committed."
      status=1
    else
      echo "    ok — only placeholders or test fixtures"
    fi
  else
    echo "    ok"
  fi
done

echo "==> scanning for: PostgreSQL DSN with embedded credentials"
if hits=$(git grep -nE "${DSN_PATTERN}" -- . "${EXCLUDES[@]}" 2>/dev/null); then
  real=''
  while IFS= read -r line; do
    matches=$(printf '%s\n' "${line}" | grep -oE -- "${DSN_PATTERN}" || true)
    unsafe=$(printf '%s\n' "${matches}" | grep -vE "^(${DSN_ALLOW})" || true)
    if [[ -n "${unsafe}" ]]; then
      real+="${line}"$'\n'
    fi
  done <<< "${hits}"
  if [[ -n "${real}" ]]; then
    echo "${real}"
    echo "    FAIL: a PostgreSQL DSN with embedded credentials is committed."
    status=1
  else
    echo "    ok — only documented fixtures and placeholders"
  fi
else
  echo "    ok"
fi

if [[ ${status} -ne 0 ]]; then
  cat <<'MSG'

A credential appears in the tracked tree.

Do NOT simply delete the line and re-push. A secret that reached a remote is
compromised regardless of later edits, because it remains in history.

  1. Revoke the credential at its issuer, now.
  2. Move the value into the secret manager.
  3. Reference it from config as ${VAR}, never as a literal.
  4. If the value is a fixture and not a secret, add it to the allow-list in
     this script with a comment explaining why it is safe.

MSG
  exit 1
fi

echo "secret-scan-guard: OK"
