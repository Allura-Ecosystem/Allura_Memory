#!/usr/bin/env python3
"""Reproduce against a read-only offline baseline; never inspect a runtime."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('verify_export', ROOT / 'verify-export.py')
assert spec is not None and spec.loader is not None
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path, help='Offline original runtime source matching all 21 context hashes')
    args = parser.parse_args()
    baseline = args.baseline.resolve(strict=True)
    context = verifier.load('baseline-context-sha256.json')
    verifier.verify(baseline, context)
    verifier.verify(baseline, verifier.load('base-source-sha256.json'))
    if not (ROOT / 'node_modules/.bin/vitest').is_file():
        raise SystemExit('Install the locked bundle dependencies first: npm ci --ignore-scripts --no-audit --no-fund')
    output = ROOT / '.validation'
    output.mkdir(exist_ok=True)
    if output.is_symlink():
        raise SystemExit('Validation output cannot be a symlink')
    work = Path(tempfile.mkdtemp(prefix='run-', dir=output))
    for name in context:
        target = work / 'base' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(verifier.safe_path(baseline, name), target)
    shutil.copytree(work / 'base', work / 'candidate')
    verifier.apply(work / 'candidate')
    for name in ['tests', 'scripts']:
        shutil.copytree(ROOT / name, work / name)
    for name in ['vitest.config.ts', 'tsconfig.repair.json', 'package.json']:
        shutil.copyfile(ROOT / name, work / name)
    (work / 'evidence').mkdir()

    def run(args, log):
        result = subprocess.run(args, cwd=work, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        (work / 'evidence' / log).write_text(result.stdout)
        print(result.stdout, end='')
        if result.returncode:
            raise SystemExit(result.returncode)

    run(['node', str(ROOT / 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.config.ts',
         '--reporter=verbose', '--reporter=json', '--outputFile=evidence/vitest-results.json'], 'tests.log')
    run(['node', 'scripts/prepare-typecheck.mjs'], 'syntax.log')
    run(['node', str(ROOT / 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.repair.json'], 'typecheck.log')
    report = json.loads((work / 'evidence/vitest-results.json').read_text())
    counts = {Path(item['name']).name: len(item['assertionResults']) for item in report['testResults']}
    assert report['success'] and report['numFailedTests'] == 0
    assert counts == {'legacy-regression.test.ts': 2, 'review.test.ts': 4,
                      'scoped-export.pglite.test.ts': 19, 'scoped-export.unit.test.ts': 48}, counts
    assert report['numTotalTests'] == sum(counts.values())
    verifier.verify(baseline, context)  # read-only caller baseline remains unchanged
    verifier.verify(work / 'candidate', verifier.load('patched-source-sha256.json'))
    summary = {
        'tests': report['numTotalTests'], 'passed': report['numPassedTests'], 'failed': report['numFailedTests'],
        'files': counts, 'baseline_context_files': len(context),
        'baseline_unchanged': True, 'exact_patch_and_candidate_hashes': True,
        'focused_typecheck_exit': 0, 'changed_file_syntax_exit': 0,
        'patch_sha256': hashlib.sha256((ROOT / 'memory-export-repair.patch').read_bytes()).hexdigest(),
        'proof_limit': 'Minimal PGlite fixture, real guard/transaction helper, AST-extracted wrapper; not full migrations, server, transport, build or deployment',
    }
    (work / 'evidence/summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))
    print('Generated diagnostics: ' + str(work.relative_to(ROOT)))


if __name__ == '__main__':
    main()
