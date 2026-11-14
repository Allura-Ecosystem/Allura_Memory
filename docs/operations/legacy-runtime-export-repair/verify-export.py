#!/usr/bin/env python3
"""Verify/apply the preserved patch to an exact OFFLINE legacy export only."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PATCH_SHA256 = '56b78a161bebd621e9504d9dbe12eb97350bbc31bb91c0e2326b914da4876bcb'


def safe_path(root, name):
    relative = Path(name)
    if relative.is_absolute() or '..' in relative.parts or not relative.parts:
        raise ValueError('Unsafe manifest path')
    path = root / relative
    if any(part.is_symlink() for part in [path, *path.parents] if part != root.parent):
        raise ValueError('Symlink in source path: ' + name)
    if not path.resolve().is_relative_to(root):
        raise ValueError('Unsafe source path: ' + name)
    return path


def verify(root, manifest):
    for name, digest in manifest.items():
        path = safe_path(root, name)
        if digest is None:
            if path.exists():
                raise ValueError('New source already exists: ' + name)
        elif not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError('Source mismatch: ' + name)


def load(name):
    return json.loads((HERE / name).read_text())


def apply(root):
    patch = HERE / 'memory-export-repair.patch'
    if hashlib.sha256(patch.read_bytes()).hexdigest() != PATCH_SHA256:
        raise ValueError('Preserved patch hash mismatch')
    verify(root, load('base-source-sha256.json'))
    command = ['patch', '--batch', '--forward', '--fuzz=0', '-p1', '-d', str(root), '-i', str(patch)]
    subprocess.run(command + ['--dry-run'], check=True)
    subprocess.run(command, check=True)
    verify(root, load('patched-source-sha256.json'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export', type=Path)
    parser.add_argument('--apply', action='store_true', help='Mutates only the supplied offline source export')
    args = parser.parse_args()
    if args.export.is_symlink():
        raise ValueError('Offline export root cannot be a symlink')
    root = args.export.resolve(strict=True)
    if not root.is_dir():
        raise ValueError('Offline export must be a directory')
    if args.apply:
        apply(root)
    verify(root, load('patched-source-sha256.json'))
    print('PASS: both exact offline export source hashes')


if __name__ == '__main__':
    main()
