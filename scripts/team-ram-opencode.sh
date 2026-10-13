#!/usr/bin/env bash
set -euo pipefail

# Keep project execution inside the governed Team RAM skill catalog. OpenCode
# otherwise loads user-global Claude/Agent skills and plugin-provided skills;
# those can override a project skill with the same name.
export OPENCODE_PURE=1
export OPENCODE_DISABLE_EXTERNAL_SKILLS=1
export OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1

exec opencode "$@"
