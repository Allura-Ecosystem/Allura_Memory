#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path


REQUIRED = [
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    "README.md",
    "skills/allura-cowork/SKILL.md",
    "agents/cowork-orchestrator.md",
    "commands/cowork-start.md",
    "commands/cowork-handoff.md",
    "commands/cowork-validate.md",
    "commands/cowork-close.md",
    "hooks/hooks.json",
    "hooks/cowork-context.py",
    "schemas/handoff.schema.json",
]


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    missing = [rel for rel in REQUIRED if not (root / rel).exists()]
    if missing:
        print(json.dumps({"status": "failed", "missing": missing}, indent=2))
        return 1

    codex = load_json(root / ".codex-plugin/plugin.json")
    claude = load_json(root / ".claude-plugin/plugin.json")
    hooks = load_json(root / "hooks/hooks.json")
    schema = load_json(root / "schemas/handoff.schema.json")

    errors = []
    for name, manifest in [("codex", codex), ("claude", claude)]:
        if manifest.get("name") != "allura-cowork":
            errors.append(f"{name} manifest name mismatch")
        if "[TODO:" in json.dumps(manifest):
            errors.append(f"{name} manifest still contains TODO placeholder")
        if "skills" not in manifest:
            errors.append(f"{name} manifest missing skills")

    if "hooks" not in hooks:
        errors.append("hooks.json missing hooks root")
    if schema.get("title") != "Allura Cowork Handoff":
        errors.append("handoff schema title mismatch")

    hook_input = json.dumps({"prompt": "Create a Claude and Codex cowork handoff"})
    proc = subprocess.run(
        [sys.executable, str(root / "hooks/cowork-context.py")],
        input=hook_input,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0 or "Allura Cowork reminder" not in proc.stdout:
        errors.append("cowork hook smoke test failed")

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
