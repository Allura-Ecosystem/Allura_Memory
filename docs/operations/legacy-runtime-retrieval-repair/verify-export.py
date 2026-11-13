#!/usr/bin/env python3
"""Verify/apply the retrieval patch to an exact offline source export only."""
import argparse, hashlib, json, subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent

def verify(root, manifest):
    for name, digest in json.loads((HERE/manifest).read_text()).items():
        relative=Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise SystemExit('Unsafe manifest path')
        path=root/relative
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise SystemExit('Unsafe source path: '+name)
        if digest is None:
            if path.exists(): raise SystemExit('New source already exists: '+name)
        elif not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
            raise SystemExit('Source mismatch: '+name)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('export',type=Path)
    p.add_argument('--apply',action='store_true')
    a=p.parse_args();root=a.export.resolve(strict=True)
    if a.apply:
        verify(root,'base-source-sha256.json')
        subprocess.run(['git','apply','--check',str(HERE/'retrieval-runtime.patch')],cwd=root,check=True)
        subprocess.run(['git','apply',str(HERE/'retrieval-runtime.patch')],cwd=root,check=True)
    verify(root,'patched-source-sha256.json')
    print('PASS: exact offline retrieval source hashes')
if __name__=='__main__':main()
