"""Exercise the installed command, not a simulated shell."""
import subprocess
import tempfile
from pathlib import Path
import unittest

COMMAND = '/home/sabira/.local/bin/allura-dev'
TARGET = '/home/sabira/Allura_Memory-beta-local/foundation'

class DevelopmentTarget(unittest.TestCase):
    def test_where_selects_active_checkout_from_any_directory(self):
        result = subprocess.run([COMMAND, '--where'], cwd='/', capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), TARGET)

    def test_unknown_command_is_rejected(self):
        result = subprocess.run([COMMAND, '--not-a-dev-option'], cwd='/', capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('Usage: allura-dev', result.stderr)

    def test_help_and_extra_arguments(self):
        for args in [[], ['--help']]:
            result = subprocess.run([COMMAND, *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertIn('Usage: allura-dev', result.stdout)
        for args in [['--where', 'extra'], ['run', 'start'], ['run', 'check', 'extra']]:
            result = subprocess.run([COMMAND, *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)

    def test_missing_target_and_toolchain_have_no_fallback(self):
        source = Path(COMMAND).read_text()
        with tempfile.TemporaryDirectory(dir='/home/sabira/.hermes/profiles/troy/cache/scratch') as directory:
            script = Path(directory) / 'wrapper'
            for old, new, args in [
                ('ROOT=/home/sabira/Allura_Memory-beta-local', f'ROOT={directory}/missing', ['--where']),
                ('TOOLS=/home/sabira/.local/share/allura-toolchain', f'TOOLS={directory}/missing', ['run', 'check:toolchain']),
            ]:
                self.assertIn(old, source)
                script.write_text(source.replace(old, new, 1))
                result = subprocess.run(['/bin/sh', str(script), *args], capture_output=True, text=True)
                self.assertEqual(result.returncode, 1)
                self.assertIn('no fallback', result.stderr)

    def test_installed_toolchain(self):
        result = subprocess.run([COMMAND, 'run', 'check:toolchain'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Bun 1.3.14, Node v24.19.0', result.stdout)
        self.assertIn('/home/sabira/Allura_Memory-beta-local', result.stderr)

if __name__ == '__main__':
    unittest.main()
