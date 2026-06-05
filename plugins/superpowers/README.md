# superpowers

> Extended capability plugin for Codex — placeholder for future Allura integrations.

## Purpose

The `superpowers` plugin is a minimal manifest-only plugin that reserves the extension point for additional Codex capabilities beyond core memory operations.

## Status

| Aspect | Status |
|--------|--------|
| Manifest | ✅ Present |
| Skills | 🔮 Planned |
| Hooks | 🔮 Planned |
| MCP servers | 🔮 Planned |

**Current state:** The plugin structure exists but contains no active skills or hooks. It serves as a placeholder for future expansion.

## Runtime Support

| Runtime | Status |
|---------|--------|
| Codex | ✅ Manifest registered |
| Claude Code | ❌ Not applicable |

## Installation

```bash
codex plugin install ./plugins/superpowers
```

## Future Capabilities

Planned extensions (not yet implemented):

- Additional MCP server integrations beyond core memory
- Extended skill library for advanced memory workflows
- Custom hooks for domain-specific governance rules
- Integration adapters for third-party services

## Contributing

To extend this plugin:

1. Add skills to `skills/`
2. Add hooks to `hooks/`
3. Update `.codex-plugin/plugin.json` with new capabilities
4. Validate with `python3 scripts/validate_plugin.py .`

See [`docs/plugins/writing-plugins.md`](../../docs/plugins/writing-plugins.md) for the full authoring guide.

## See Also

- [`catalog/plugins.md`](../../catalog/plugins.md) — Public plugin index
- [`docs/plugins/index.md`](../../docs/plugins/index.md) — Plugin system overview
- [`plugins/allura/`](../allura/) — Core plugin with active skills

---

*This plugin is a reserved extension point. No active capabilities are shipped yet.*
