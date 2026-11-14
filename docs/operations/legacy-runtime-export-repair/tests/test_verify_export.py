"""Dependency-free safety tests; no legacy baseline or service needed."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('verify_export', HERE / 'verify-export.py')
assert spec is not None and spec.loader is not None
verify_export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_export)
OUTPUT = HERE / '.validation'
OUTPUT.mkdir(exist_ok=True)


class OfflineVerifierTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='verifier-', dir=OUTPUT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root / 'source.ts'
        self.file.write_text('fixture source\n')
        self.digest = hashlib.sha256(self.file.read_bytes()).hexdigest()

    def test_exact_original_file(self):
        verify_export.verify(self.root, {'source.ts': self.digest, 'new.ts': None})

    def test_drift_rejected_without_writing(self):
        with self.assertRaisesRegex(ValueError, 'Source mismatch'):
            verify_export.verify(self.root, {'source.ts': '0' * 64})
        self.assertEqual(self.file.read_text(), 'fixture source\n')

    def test_new_source_must_be_absent(self):
        with self.assertRaisesRegex(ValueError, 'already exists'):
            verify_export.verify(self.root, {'source.ts': None})

    def test_missing_file_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Source mismatch'):
            verify_export.verify(self.root, {'absent.ts': self.digest})

    def test_parent_traversal_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Unsafe manifest path'):
            verify_export.verify(self.root, {'../source.ts': self.digest})

    def test_absolute_path_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Unsafe manifest path'):
            verify_export.verify(self.root, {str(self.file): self.digest})

    def test_file_symlink_rejected(self):
        (self.root / 'alias.ts').symlink_to(self.file)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            verify_export.verify(self.root, {'alias.ts': self.digest})

    def test_directory_symlink_rejected_even_within_export(self):
        (self.root / 'alias').symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            verify_export.verify(self.root, {'alias/source.ts': self.digest})

    def test_tampered_patch_rejected_before_subprocess_or_source_write(self):
        (self.root / 'memory-export-repair.patch').write_text('fixture tampered patch')
        with patch.object(verify_export, 'HERE', self.root), patch.object(verify_export.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'patch hash mismatch'):
                verify_export.apply(self.root)
            run.assert_not_called()
        self.assertEqual(self.file.read_text(), 'fixture source\n')


if __name__ == '__main__':
    unittest.main()
