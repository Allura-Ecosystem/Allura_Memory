import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// RAM_PERSONA_ROOT supports a prepared release tree; ordinary runs use this repo.
const root = process.env.RAM_PERSONA_ROOT ?? resolve(import.meta.dir, "../..");
const plugin = existsSync(resolve(root, ".opencode/agent/core/woz.md"));
const roles = {
  jobs: "core/jobs.md",
  woz: "subagents/code/woz.md",
  pike: "subagents/review/pike.md",
  fowler: "subagents/review/fowler.md",
  bellard: "subagents/code/bellard.md",
  carmack: "subagents/code/carmack.md",
  knuth: "subagents/infrastructure/knuth.md",
  hightower: "subagents/infrastructure/hightower.md",
  scout: "subagents/core/scout.md",
} as const;

const read = (path: string): string => readFileSync(resolve(root, path), "utf8");
const markdownBody = (text: string): string => {
  const match = text.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Missing frontmatter");
  return match[1]
    .replace(/^\s*<!-- GENERATED[^\n]*-->\n/, "")
    .split("\n## Claude Bridge\n")[0].trim();
};

describe("RAM compact persona delivery contract", () => {
  for (const [role, local] of Object.entries(roles)) {
    const path = `.opencode/agent/${plugin ? `core/${role}.md` : local}`;
    const source = markdownBody(read(path));
    const heading = `## ${role[0].toUpperCase()}${role.slice(1)} voice and reasoning`;
    const capsule = source.split(`${heading}\n\n`)[1]?.split("\n\n---\n")[0];

    test(`${role}: one bounded voice capsule precedes workflow`, () => {
      expect(capsule).toBeDefined();
      expect(source.startsWith(heading)).toBe(true);
      const words = capsule!.trim().split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(150);
      expect(words).toBeLessThanOrEqual(250);
      expect(source.match(/ voice and reasoning\n/g)).toHaveLength(1);
      expect(source).not.toContain("## Distinct reasoning and voice contract");
      expect(source).not.toMatch(/^#{2,3} (?:Persona|Voice)\s*$/m);
      expect(capsule).toMatch(/example|For example/i);
      expect(capsule).toMatch(/Ask:|question/);
    });

    test(`${role}: parsed runtime mirrors preserve the canonical body`, () => {
      const mirrors = plugin
        ? [`.claude/agents/${role}.md`, `agents/${role}.md`, `.claude-plugin/agents/${role}.md`]
        : [`.claude/agents/${role}.md`];
      for (const mirror of mirrors) expect(markdownBody(read(mirror))).toBe(source);
      const codex = Bun.TOML.parse(read(`.codex/agents/${role}.toml`));
      expect(String(codex.developer_instructions).trim()).toBe(source);
    });

    test(`${role}: inspiration grants no identity or access`, () => {
      expect(source).not.toMatch(/You are (?:\*\*)?(?:Steve Jobs|Steve Wozniak|Rob Pike|Martin Fowler|Fabrice Bellard|John Carmack|Donald Knuth|Kelsey Hightower)\b/);
      expect(capsule).toMatch(/instruction (?:priority|hierarchy)/i);
      expect(source).toMatch(/human (?:approval|promotion|curator)/i);
      if (role === "scout") {
        expect(capsule).toContain("functional reconnaissance");
        expect(capsule).toContain("does not implement or grant approval");
      } else {
        expect(capsule).toMatch(/historical.*identity/);
        expect(capsule).toContain("credentials");
        expect(capsule).toContain("endorsement");
      }
      expect(source).not.toMatch(/Promote[^\n]*(?:confidence|score)\s*>=/);
      expect(source).not.toMatch(/user_id:\s*"(?:scout-recon|woz|pike|jobs)"/);
      expect(source).toContain("allura-system");
    });
  }

  test("Jobs can provide a human brief without compulsory JSON or repeated approval", () => {
    const jobs = markdownBody(read(".opencode/agent/core/jobs.md"));
    expect(jobs).not.toContain("## Intent Brief Contract\n\n```json");
    if (plugin) expect(jobs).toContain("Use JSON only when a caller explicitly requires");
    else expect(jobs).toContain("Existing user authorization satisfies sign-off within its scope");
  });
});
