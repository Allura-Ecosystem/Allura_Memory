#!/usr/bin/env bash
# Setup / repair Allura Claude Code plugins.
# Safe to re-run. Backs up any file it overwrites to <file>.bak.
set -euo pipefail

PLUGINS="$HOME/.claude/plugins"
BRAIN="$PLUGINS/allura-brain"
COWORK="$PLUGINS/allura-cowork"
MKT="$PLUGINS/allura-marketplace"

backup() { [ -f "$1" ] && cp -n "$1" "$1.bak" || true; }

echo "==> 1/4  Patching allura-brain hooks (invoke via python3, no exec-bit dependency)"
backup "$BRAIN/hooks/hooks.json"
cat > "$BRAIN/hooks/hooks.json" <<'JSON'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__allura-brain__.*|mcp__memory__.*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/hooks/allura-brain-guard.py\""
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/hooks/allura-brain-prompt-context.py\""
          }
        ]
      }
    ]
  }
}
JSON

echo "==> 2/4  Patching allura-cowork hooks (python3 + corrected fallback path)"
backup "$COWORK/hooks/hooks.json"
cat > "$COWORK/hooks/hooks.json" <<'JSON'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"${CLAUDE_PLUGIN_ROOT:-/home/ronin704/.claude/plugins/allura-cowork}/hooks/cowork-context.py\""
          }
        ]
      }
    ]
  }
}
JSON

echo "==> 3/4  Marking hook scripts executable (belt-and-suspenders)"
chmod +x "$BRAIN"/hooks/*.py "$COWORK"/hooks/*.py 2>/dev/null || true

echo "==> 4/4  Creating local marketplace manifest"
mkdir -p "$MKT/.claude-plugin"
cat > "$MKT/.claude-plugin/marketplace.json" <<'JSON'
{
  "name": "allura-local",
  "owner": { "name": "Team RAM" },
  "metadata": { "description": "Local Allura governance + cowork plugins." },
  "plugins": [
    {
      "name": "allura-brain",
      "source": "../allura-brain",
      "description": "Governed Allura Brain memory: MCP registration, tenant guardrails, workflow reminders.",
      "version": "1.0.0",
      "author": { "name": "Team RAM" },
      "category": "Productivity"
    },
    {
      "name": "allura-cowork",
      "source": "../allura-cowork",
      "description": "Claude + Codex cowork protocol with governed handoffs and validation.",
      "version": "0.1.0",
      "author": { "name": "Team RAM" },
      "category": "Coding"
    }
  ]
}
JSON

echo
echo "Files written:"
echo "  $BRAIN/hooks/hooks.json"
echo "  $COWORK/hooks/hooks.json"
echo "  $MKT/.claude-plugin/marketplace.json"
echo
echo "Validating JSON..."
for f in "$BRAIN/hooks/hooks.json" "$COWORK/hooks/hooks.json" "$MKT/.claude-plugin/marketplace.json"; do
  python3 -m json.tool "$f" >/dev/null && echo "  OK  $f"
done

cat <<'NEXT'

------------------------------------------------------------------
NEXT STEPS — these CANNOT be scripted (run them yourself):
------------------------------------------------------------------

A) Register + install the plugins inside Claude Code, then restart:
     /plugin marketplace add ~/.claude/plugins/allura-marketplace
     /plugin install allura-brain@allura-local     # choose USER scope
     /plugin install allura-cowork@allura-local    # choose USER scope

   CAVEAT: allura-brain is ALSO declared in ~/.claude.json (global
   mcpServers) AND in the plugin's mcp-config.json. After installing
   the plugin you'll have two "allura-brain" servers = name collision.
   Pick ONE owner. Recommended: delete the "allura-brain" block from
   ~/.claude.json mcpServers and let the plugin own it.

B) Verify the MCP gateway + Brain service on the HOST:
     docker mcp --help                         # is the MCP Toolkit CLI installed?
     docker mcp gateway run --profile default  # does it start clean? (Ctrl-C to stop)
     docker mcp server list                    # what's enabled in 'default'
     curl -s http://localhost:5888/mcp         # is Allura Brain actually up?

   Start the Brain service FIRST, then in Claude run /mcp to reconnect.
   "MCP session not found" clears on reconnect once the service is stable.
------------------------------------------------------------------
NEXT
echo "Done."
