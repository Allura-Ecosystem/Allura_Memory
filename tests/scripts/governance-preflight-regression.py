#!/usr/bin/env python3
"""Offline hook regressions: only subprocess input, never a database connection."""
import importlib.util
import json
import pathlib
import subprocess
import sys
import unittest

if len(sys.argv) < 2:
    raise SystemExit("Usage: governance-preflight-regression.py /path/to/governance-preflight.py")
HOOK = pathlib.Path(sys.argv.pop(1))
spec = importlib.util.spec_from_file_location("governance_preflight", HOOK)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class GovernanceRegression(unittest.TestCase):
    def test_inert_shell_commands(self):
        for command in [
            "rg --no-config -n 'UPDATE/DELETE on events' hooks/",
            "rg --no-config -n 'UPDATE events SET content' docs/",
            "grep 'docker exec' docs/guide.md",
            "apply_patch <<'PATCH'\n*** Begin Patch\n+UPDATE events SET content = 'example';\n+docker exec db true\n*** End Patch\nPATCH\n",
            "apply_patch <<'PATCH'\n*** Begin Patch\n+Never UPDATE or DELETE traces.\n*** End Patch\nPATCH\ngit diff --check",
            "bun test tests/updates-events.test.ts",
        ]:
            with self.subTest(command=command):
                self.assertFalse(guard.check_bash({"command": command})[0])

    def test_real_shell_mutations_and_execution(self):
        for command in [
            "psql -c 'UPDATE events SET content = 1'",
            'psql -c \'DELETE FROM "public"."traces"\'',
            'python3 -c "execute(\'UPDATE events SET content=1\')"',
            "docker exec db psql",
            "psql -f /tmp/query.sql",
            "rg safe docs; psql -c 'DELETE FROM events'",
            "rg safe docs && docker exec db true",
            "rg \"$(psql -c 'DELETE FROM events')\" docs",
            "rg '`docker exec db true`' docs",
            "apply_patch <<'PATCH'\n*** Begin Patch\n*** End Patch\nPATCH\npsql -c 'DELETE FROM events'",
            "apply_patch <<PATCH\n$(psql -c 'DELETE FROM events')\nPATCH",
            'bash -c "\napply_patch <<\'PATCH\'\n$(psql -c \'DELETE FROM events\')\nPATCH\n"',
            "rg --pre 'psql -f /tmp/query.sql' data",
            "rg --hostname-bin=psql data",
            "rg --no-config ${SEARCH_OPTIONS} 'UPDATE events SET x' docs/",
            "rg 'UPDATE events SET x' docs/",
            "rg --no-config --pre{=psql,=true} 'UPDATE events SET x' docs/",
            "rg --no-config --pr?=psql 'UPDATE events SET x' docs/",
            "rg -e --no-config 'UPDATE events SET x' docs/",
            "rg -- --no-config 'UPDATE events SET x' docs/",
            "apply_patch <<'PATCH'\ntext\nPATCH\napply_patch <<'SECOND'\ntext\nSECOND\ndocker exec db true",
        ]:
            with self.subTest(command=command):
                self.assertTrue(guard.check_bash({"command": command})[0])

    def test_direct_sql_protection_unchanged(self):
        for key in ["query", "sql", "statement"]:
            for sql in ["UPDATE events SET content = 1 WHERE group_id = 'allura-system'", "DELETE FROM traces WHERE group_id = 'allura-system'", "SELECT * FROM events"]:
                with self.subTest(key=key, sql=sql):
                    self.assertTrue(guard.check_sql({key: sql})[0])
        self.assertFalse(guard.check_sql({"query": "SELECT * FROM events WHERE group_id = 'allura-system'"})[0])

    def test_complete_hook_protocol(self):
        for command, blocked in [("rg --no-config 'UPDATE events SET' docs/", False), ("psql -c 'DELETE FROM events'", True)]:
            result = subprocess.run([sys.executable, str(HOOK)], input=json.dumps({"tool_name": "Bash", "tool_input": {"command": command}}), capture_output=True, text=True, check=True)
            self.assertEqual(bool(result.stdout.strip()), blocked)
            if blocked:
                self.assertEqual(json.loads(result.stdout)["decision"], "block")

    def test_promotion_and_graph_checks_retained(self):
        if hasattr(guard, "check_promote"):
            self.assertTrue(guard.check_promote("memory_promote", {})[0])
            self.assertTrue(guard.check_neo4j_write("create_entities", {"query": "MATCH (n) SET n.name = 'changed'"})[0])


if __name__ == "__main__":
    unittest.main()
