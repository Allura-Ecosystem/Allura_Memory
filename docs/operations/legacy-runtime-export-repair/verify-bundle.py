#!/usr/bin/env python3
"""Check the publication inventory, hashes and portable privacy boundary offline."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
GENERATED = {'node_modules', '.validation', '__pycache__'}


def publication_files():
    return sorted(path for path in ROOT.rglob('*')
                  if not any(part in GENERATED for part in path.relative_to(ROOT).parts)
                  and (path.is_file() or path.is_symlink()))


def main():
    manifest = json.loads((ROOT / 'bundle-sha256.json').read_text())
    actual = {}
    for path in publication_files():
        name = path.relative_to(ROOT).as_posix()
        if path.is_symlink():
            raise SystemExit('Publication symlink rejected: ' + name)
        if name == 'bundle-sha256.json':
            continue
        data = path.read_bytes()
        text = data.decode('utf-8')
        # Paths and runtime identities are deliberately not publication evidence.
        if re.search(r'/(?:home|Users)/[\w.-]+|[A-Z]:\\Users\\|allura-local-mcp-\d', text):
            raise SystemExit('Private host/runtime reference: ' + name)
        if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text):
            raise SystemExit('Private key marker: ' + name)
        actual[name] = hashlib.sha256(data).hexdigest()
    if actual != manifest:
        raise SystemExit('Publication inventory/hash mismatch')
    print(f'PASS: {len(actual)} exact publication files plus manifest; no private host/runtime references')
    print('This privacy check is not a general secret scanner; run Gitleaks separately on this inventory.')


if __name__ == '__main__':
    main()
