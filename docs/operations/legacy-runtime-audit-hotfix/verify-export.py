#!/usr/bin/env python3
"""Verify or patch an offline export of the exact legacy runtime source."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent


def verify(root: Path, manifest: str) -> None:
    expected = json.loads((HERE / manifest).read_text())
    for name, digest in expected.items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise SystemExit('Unsafe manifest path')
        source = root / relative
        if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(root):
            raise SystemExit(f'Missing or unsafe source file: {name}')
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise SystemExit(f'Source mismatch: {name}; no patch was started')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export', type=Path, help='Offline legacy-runtime source export, not the live application')
    parser.add_argument('--apply', action='store_true', help='Apply to an exact matching baseline; otherwise verify patched files only')
    args = parser.parse_args()
    root = args.export.resolve(strict=True)
    if not root.is_dir():
        raise SystemExit('Source export must be a directory')
    if args.apply:
        verify(root, 'base-source-sha256.json')
        patch = str(HERE / 'audit-runtime.patch')
        subprocess.run(['git', 'apply', '--check', patch], cwd=root, check=True)
        subprocess.run(['git', 'apply', patch], cwd=root, check=True)
    verify(root, 'patched-source-sha256.json')
    print('PASS: all patched runtime source hashes match the deployed repair')


if __name__ == '__main__':
    main()
