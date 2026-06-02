#!/usr/bin/env python3
import json
import re
import sys


TRIGGER = re.compile(
    r"\b(cowork|co-work|claude\s+and\s+codex|codex\s+and\s+claude|handoff|hand\s*off|pair\s+claude|pair\s+codex)\b",
    re.IGNORECASE,
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    prompt = str(payload.get("prompt") or "")
    if not TRIGGER.search(prompt):
        return 0

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": (
                "Allura Cowork reminder: identify the active runtime; search "
                "Allura Brain before planning when available; separate runtime "
                "perspective from actual execution; use a handoff packet for "
                "cross-runtime work; validate before done; write an outcome "
                "receipt after substantive work; do not mutate runtime, config, "
                "cron, production, semantic memory, Notion sync, or Done/Approved "
                "status without explicit approval."
            )
        }
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
