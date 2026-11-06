"""Synthetic launcher controls; actual installed-tool checks remain separate."""
from pathlib import Path
import json
import os
import subprocess
import tempfile
import unittest

LAUNCHER = Path(__file__).with_name('with-toolchain.sh').resolve()
FOUNDATION = LAUNCHER.parent.parent
SCRATCH = Path(os.environ.get('TMPDIR', str(Path.home() / '.cache' / 'allura-test-scratch')))
SCRATCH.mkdir(parents=True, exist_ok=True)


class ToolchainLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='launcher ', dir=SCRATCH)
        self.root = Path(self.temp.name)
        self.tools = self.root / 'tools with spaces'
        self.env = dict(os.environ, ALLURA_TOOLCHAIN_ROOT=str(self.tools))

    def tearDown(self):
        self.temp.cleanup()

    def tool(self, relative, version):
        target = self.tools / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('#!/bin/sh\nif [ "$1" = "--version" ]; then printf "%s\\n" ' + version + '; exit 0; fi\nprintf "%s\\n" "$@"\n')
        target.chmod(0o700)

    def prepare(self, node='v24.19.0'):
        self.tool('bun-linux-x64-baseline/bun', '1.3.14')
        self.tool('node-v24.19.0-linux-x64/bin/node', node)

    def run_launcher(self, *args):
        return subprocess.run(['sh', str(LAUNCHER), *args], cwd=self.root,
                              env=self.env, capture_output=True, text=True,
                              timeout=10)

    def test_missing_tools_fail_before_command(self):
        marker = self.root / 'unexpected'
        p = self.run_launcher('touch', str(marker))
        self.assertNotEqual(p.returncode, 0)
        self.assertIn('Missing pinned toolchain', p.stderr)
        self.assertFalse(marker.exists())

    def test_wrong_version_fails_before_command(self):
        self.prepare(node='v99.0.0')
        marker = self.root / 'unexpected'
        p = self.run_launcher('touch', str(marker))
        self.assertNotEqual(p.returncode, 0)
        self.assertIn('validation failed', p.stderr)
        self.assertFalse(marker.exists())

    def test_arguments_are_literal_and_working_directory_is_foundation(self):
        self.prepare()
        literal = 'value with spaces; $(not-a-command)'
        p = self.run_launcher('python3', '-c',
                              'import os,sys,json;print(json.dumps([os.getcwd(),sys.argv[1]]))',
                              literal)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout), [str(FOUNDATION), literal])

    def test_no_argument_uses_default_toolchain_check(self):
        self.prepare()
        p = self.run_launcher()
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(p.stdout.splitlines(), ['run', 'check:toolchain'])

    def test_relative_override_cannot_fall_back_after_directory_change(self):
        self.prepare()
        fallback = self.root / 'unvalidated global tools'
        fallback.mkdir()
        for name in ['bun', 'node']:
            executable = fallback / name
            executable.write_text('#!/bin/sh\nprintf "%s\\n" unvalidated-fallback\n')
            executable.chmod(0o700)
        self.env['ALLURA_TOOLCHAIN_ROOT'] = self.tools.name
        self.env['PATH'] = str(fallback) + os.pathsep + self.env['PATH']
        p = self.run_launcher('bun', 'probe', 'literal argument')
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(p.stdout.splitlines(), ['probe', 'literal argument'])


if __name__ == '__main__':
    unittest.main()
