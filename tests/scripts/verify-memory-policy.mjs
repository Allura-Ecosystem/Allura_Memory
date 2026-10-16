import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const [plugins, bahari, openclaw] = process.argv.slice(2);
if (!plugins || !bahari || !openclaw) {
  throw new Error("Usage: bun verify-memory-policy.mjs <allura-plugins> <allura-team-ram> <OpenClaw SKILL.md>");
}
const skill = join(plugins, "team-durham/skills/allura-memory-skill");
const read = (p) => readFileSync(p, "utf8");
const docs = ["SKILL.md", "references/allura-memory-model.md", "references/allura-promotion-policy.md", "references/allura-dual-context-retrieval.md", "references/allura-troubleshooting.md"].map(p => read(join(skill, p)));
const role = read(join(bahari, ".opencode/agent/core/bahari.md"));
const activation = read(join(bahari, ".opencode/skills/agent-bahari/SKILL.md"));
const texts = [...docs, role, activation, read(openclaw)];
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
for (const text of texts) {
  check(!/user_id\s*:\s*["'](?:bahari-curator|kotler|aaker|gilliam-v3)/.test(text), "No persona identity assertions");
  check(!/MCP_DOCKER_(?:execute_sql|insert_data|create_entities|create_relations|add_observations)/.test(text), "No direct database fallback tools");
  check(!/metadata\s*:\s*\{[^}]*\b(?:tags|memory_type)\s*:/s.test(text), "No invented metadata fields");
  check(/scop|group_id/.test(text), "Scope contract retained");
}
const meta = JSON.parse(read(join(skill, "metadata.json")));
check(meta.primary_tools.length === 0, "Metadata defers tool discovery to live host");
check(!JSON.stringify(meta).includes("execute_sql"), "No stale SQL metadata");
check(meta.companion_skills.length === 0, "No automatic legacy fallback skill loading");
for (const name of ["Ogilvy", "Tufte"]) {
  const row = docs[0].split("\n").find(line => line.startsWith(`| ${name} |`));
  check(/\| No(?:;[^|]*)? \| No \| Request \|/.test(row), `${name} write boundaries retained`);
}
check(docs[0].includes("| Munari | No; read-only | No; read-only | No |"), "QA stays read-only");
const sourceBody = role.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)[1];
for (const path of ["agents/bahari.md", ".claude/agents/bahari.md", ".claude-plugin/agents/bahari.md"]) {
  const mirror = read(join(bahari, path));
  check(sourceBody === mirror.slice(mirror.indexOf("-->", mirror.indexOf("<!-- GENERATED")) + 4), "Canonical/public Bahari body equality");
}
for (const phrase of ["may read and write", "soft-delete", "restore", "human-approved transitions", "Warm, patient, gently curious", "**Can Delegate To** | None"]) {
  check(role.includes(phrase), `Bahari upgrade and voice: ${phrase}`);
}
check(!role.includes("never `allura-system`"), "No blanket system-space prohibition");
check(role.includes("audit-only assignment permits findings only for that assignment"), "Audit-only constraint stays assignment-bounded");
for (const name of ["validate-env.sh", "smoke-test-memory.sh"]) {
  const path = join(skill, "scripts", name);
  const text = read(path);
  check(!/\b(?:docker|curl|psql|memory_add|memory_delete)\s/.test(text.replace(/^#.*$/gm, "")), "Helpers contain no database/network commands");
  execFileSync("bash", ["-n", path]);
  const output = execFileSync("bash", [path], { encoding: "utf8" });
  check(output.includes("MANUAL") && /no live/.test(output), "Helpers honestly report manual verification");
}
console.log(`${checks} actual-source policy assertions passed; no live curator mutation was tested.`);
