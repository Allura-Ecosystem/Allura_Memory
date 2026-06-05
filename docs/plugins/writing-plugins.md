# Writing Allura Plugins

> Guide for creating custom plugins that extend Allura's agent runtimes.

## Plugin Types

Allura supports four plugin types:

| Type | Purpose | Runtimes |
|------|---------|----------|
| **Governance** | Enforce invariants on tool calls | Claude, Codex |
| **Cowork** | Cross-runtime collaboration | Claude, Codex |
| **Core** | Runtime-specific skills and assets | Codex |
| **Extension** | Additional capabilities | Codex |

## Directory Structure

Every plugin must follow this structure:

```
plugins/<plugin-name>/
├── README.md                    # Plugin documentation (required)
├── .claude-plugin/              # Claude Code manifest (if supporting Claude)
│   └── plugin.json
├── .codex-plugin/               # Codex manifest (if supporting Codex)
│   └── plugin.json
├── .opencode-plugin/            # OpenCode manifest (future)
│   └── plugin.json
├── skills/                      # Skill definitions
│   └── <skill-name>/
│       └── SKILL.md
├── hooks/                       # Pre/post tool call hooks
│   ├── hooks.json               # Hook wiring manifest
│   ├── <hook-name>.py          # Hook implementations
│   └── ...
├── schemas/                     # Machine-readable schemas
│   └── <schema-name>.schema.json
├── scripts/                     # Validation and utility scripts
│   └── validate_plugin.py
└── assets/                      # Static assets (optional)
```

## Manifest Format

### Claude Code (`plugin.json`)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "hooks": {
    "preToolCall": ["my-preflight.py"],
    "postToolCall": ["my-receipt.py"],
    "userPromptSubmit": ["my-context.py"]
  },
  "permissions": [
    "memory_add",
    "memory_search"
  ]
}
```

### Codex (`plugin.json`)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "skills": ["my-skill"],
  "commands": ["my-command"],
  "hooks": {
    "preToolCall": ["my-preflight.py"],
    "postToolCall": ["my-receipt.py"]
  }
}
```

## Hook System

Hooks are Python scripts that intercept runtime events:

### PreToolCall Hook

Runs before any tool executes. Can block the call.

```python
# governance-preflight.py
import json
import sys

def main():
    tool_call = json.loads(sys.stdin.read())
    tool_name = tool_call.get("tool", "")
    params = tool_call.get("params", {})

    # Check invariant
    if tool_name in ["memory_add", "memory_search"]:
        if not params.get("group_id"):
            print(json.dumps({
                "blocked": True,
                "reason": "Missing required group_id parameter"
            }))
            return

    print(json.dumps({"blocked": False}))

if __name__ == "__main__":
    main()
```

### PostToolCall Hook

Runs after tool completes. Can inject follow-up actions.

```python
# write-receipt.py
import json
import sys

def main():
    tool_result = json.loads(sys.stdin.read())
    tool_name = tool_result.get("tool", "")

    if tool_name in ["memory_add", "memory_update"]:
        print(json.dumps({
            "inject": True,
            "message": "Remember to write a receipt for this memory operation."
        }))
    else:
        print(json.dumps({"inject": False}))

if __name__ == "__main__":
    main()
```

### UserPromptSubmit Hook

Runs when user sends a message. Can inject context.

```python
# governance-context.py
import json
import sys

def main():
    prompt = json.loads(sys.stdin.read()).get("prompt", "")

    keywords = ["database", "memory", "neo4j", "postgres", "promote", "curator"]
    if any(kw in prompt.lower() for kw in keywords):
        print(json.dumps({
            "inject": True,
            "context": "Remember Allura's 6 invariants: group_id required, append-only, SUPERSEDES versioning, HITL promotion, MCP_DOCKER only, allura-* namespace."
        }))
    else:
        print(json.dumps({"inject": False}))

if __name__ == "__main__":
    main()
```

## Hook Wiring (`hooks.json`)

```json
{
  "hooks": {
    "preToolCall": [
      {
        "script": "governance-preflight.py",
        "priority": 100,
        "description": "Block invariant violations"
      }
    ],
    "postToolCall": [
      {
        "script": "write-receipt.py",
        "priority": 50,
        "description": "Remind about receipts"
      }
    ],
    "userPromptSubmit": [
      {
        "script": "governance-context.py",
        "priority": 10,
        "description": "Inject governance context"
      }
    ]
  }
}
```

## Skills

Skills are reusable patterns documented in `SKILL.md` files:

```markdown
# my-skill

> Description of what this skill does.

## When to Use

- Scenario 1
- Scenario 2

## Steps

1. Step one
2. Step two

## Example

```typescript
// Example code
```

## Validation

How to verify the skill worked.
```

## Validation Script

Every plugin should include a validation script:

```python
# validate_plugin.py
import json
import os
import sys

def validate_plugin(plugin_dir):
    errors = []

    # Check README exists
    if not os.path.exists(os.path.join(plugin_dir, "README.md")):
        errors.append("Missing README.md")

    # Check at least one manifest exists
    manifests = [
        ".claude-plugin/plugin.json",
        ".codex-plugin/plugin.json",
        ".opencode-plugin/plugin.json"
    ]
    if not any(os.path.exists(os.path.join(plugin_dir, m)) for m in manifests):
        errors.append("No plugin manifest found")

    # Validate manifest JSON
    for manifest in manifests:
        path = os.path.join(plugin_dir, manifest)
        if os.path.exists(path):
            try:
                with open(path) as f:
                    json.load(f)
            except json.JSONDecodeError as e:
                errors.append(f"Invalid JSON in {manifest}: {e}")

    # Check hooks.json if hooks exist
    hooks_dir = os.path.join(plugin_dir, "hooks")
    if os.path.exists(hooks_dir):
        hooks_json = os.path.join(hooks_dir, "hooks.json")
        if not os.path.exists(hooks_json):
            errors.append("hooks/ exists but hooks.json is missing")

    return errors

if __name__ == "__main__":
    plugin_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    errors = validate_plugin(plugin_dir)
    if errors:
        print("VALIDATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("VALIDATION PASSED")
        sys.exit(0)
```

## Testing Your Plugin

1. **Validate structure:** `python3 scripts/validate_plugin.py .`
2. **Install locally:** `claude plugin install ./plugins/my-plugin` or `codex plugin install ./plugins/my-plugin`
3. **Test hooks:** Trigger each hook scenario manually
4. **Check receipts:** Verify post-tool-call injections fire
5. **Run integration:** Test with real memory operations

## Publishing

Plugins are distributed as directories in the `plugins/` folder:

1. Create your plugin directory
2. Add README.md with install instructions
3. Include validate_plugin.py
4. Test on both Claude and Codex (if dual-runtime)
5. Submit via PR to the main repo

## Best Practices

1. **Always include README.md** — document purpose, install, and usage
2. **Always include validate_plugin.py** — enable automated validation
3. **Use absolute paths in manifests** — relative paths fail in some runtimes
4. **Test on both runtimes** — Claude and Codex have different plugin APIs
5. **Follow invariant patterns** — governance plugins should match `allura-governance` structure
6. **Document approval boundaries** — make clear what requires human approval
7. **Version your plugin** — include version in manifest for compatibility tracking

## See Also

- [`docs/plugins/index.md`](index.md) — Plugin system overview
- [`catalog/plugins.md`](../../catalog/plugins.md) — Public plugin index
- [`plugins/allura-governance/`](../../plugins/allura-governance/) — Reference governance plugin
- [`plugins/allura-cowork/`](../../plugins/allura-cowork/) — Reference cowork plugin

---

*For issues, see [`docs/user-guide/troubleshooting.md`](../user-guide/troubleshooting.md).*
