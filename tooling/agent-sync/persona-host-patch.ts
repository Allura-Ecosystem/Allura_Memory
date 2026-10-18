/** Emit an apply_patch document for selected existing host adapters; never edit caches. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const option = (name: string): string => {
  const value = args[args.indexOf(name) + 1];
  if (!args.includes(name) || !value?.startsWith("/")) throw new Error(`${name} requires an absolute path`);
  return value;
};
const host = option("--host");
const release = option("--release");
const ram = ["brooks", "jobs", "woz", "scout", "pike", "fowler", "bellard", "carmack", "knuth", "hightower"];
const durham: Record<string, string> = {
  kotler: "brand-orchestrator", aaker: "brand-strategist", ogilvy: "copywriter",
  glaser: "visual-director", rand: "brand-kit-builder", munari: "qa-reviewer", tufte: "data-analyst",
};
const patches: string[] = [];
function replace(path: string, before: string, after: string): void {
  if (before === after) return;
  patches.push(`*** Update File: ${path}\n@@\n${before.trimEnd().split("\n").map(line => `-${line}`).join("\n")}\n${after.trimEnd().split("\n").map(line => `+${line}`).join("\n")}`);
}
for (const name of [...ram, ...Object.keys(durham)]) {
  const source = join(release, ram.includes(name) ? "team-ram-coding" : "team-durham", "agents", durham[name] ?? name) + ".md";
  if (!existsSync(source)) throw new Error(`Missing release role: ${source}`);
  const guidance = `You are Allura's ${name} AI role. Before substantive work, read the full selected role at ${source}, including its voice and reasoning contract. Apply the project's higher-priority instructions, current scope, authenticated identity and tenant boundaries. Preserve the selected role's reasoning and manner in ordinary replies and relays; do not claim to be a historical person. Load only this role and task-relevant skills, not the whole roster or research library. Reuse fresh scoped evidence. Keep the configured runtime/model; source frontmatter describes its own runtime and does not authorize configuration changes. Use Allura Cowork where available. For Allura_Memory use group_id=allura-system; never switch tenants to evade denial. Use governed Brain tools, append-only outcomes and human-reviewed promotion. No fabricated execution or verification. Menus only on activation/request; small conversation needs no startup ritual.\n`;
  const tomlPath = join(host, ".codex/agents", `${name}.toml`);
  if (existsSync(tomlPath)) {
    const before = readFileSync(tomlPath, "utf8");
    const pattern = /^developer_instructions\s*=\s*(?:"""[\s\S]*?"""|"(?:[^"\\]|\\.)*")/m;
    if (!pattern.test(before)) throw new Error(`Unsupported adapter encoding: ${tomlPath}`);
    const after = before.replace(pattern, () => `developer_instructions = ${JSON.stringify(guidance)}`);
    const oldConfig = Bun.TOML.parse(before);
    const newConfig = Bun.TOML.parse(after);
    delete oldConfig.developer_instructions;
    delete newConfig.developer_instructions;
    if (JSON.stringify(oldConfig) !== JSON.stringify(newConfig)) throw new Error(`Runtime drift: ${tomlPath}`);
    replace(tomlPath, before, after);
  }
  for (const path of [join(host, ".codex/agents", `${name}.md`), join(host, ".config/opencode/agents", `${name}.md`)]) {
    if (!existsSync(path)) continue;
    const before = readFileSync(path, "utf8");
    const header = before.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)?.[0] ?? "";
    replace(path, before, `${header}\n# Allura ${name} source adapter\n\n${guidance}`);
  }
}
process.stdout.write(`*** Begin Patch\n${patches.join("\n")}\n*** End Patch\n`);
