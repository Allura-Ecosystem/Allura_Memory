#!/usr/bin/env python3
import json
import sys
from pathlib import Path


REQUIRED = [
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    "README.md",
    "skills/allura-scout/SKILL.md",
    "commands/scout-context.md",
    "schemas/context-packet.schema.json",
]


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    missing = [rel for rel in REQUIRED if not (root / rel).exists()]
    errors = []

    if missing:
        print(json.dumps({"status": "failed", "missing": missing}, indent=2))
        return 1

    codex = load_json(root / ".codex-plugin/plugin.json")
    claude = load_json(root / ".claude-plugin/plugin.json")
    schema = load_json(root / "schemas/context-packet.schema.json")

    for name, manifest in [("codex", codex), ("claude", claude)]:
        if manifest.get("name") != "allura-scout":
            errors.append(f"{name} manifest name mismatch")
        if "skills" not in manifest:
            errors.append(f"{name} manifest missing skills")
        if "commands" not in manifest:
            errors.append(f"{name} manifest missing commands")
        if "[TODO:" in json.dumps(manifest):
            errors.append(f"{name} manifest still contains TODO placeholder")

    if schema.get("title") != "Allura Scout ContextPacket":
        errors.append("context packet schema title mismatch")

    result = {
        "status": "passed" if not errors else "failed",
        "root": str(root),
        "checked": REQUIRED,
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
