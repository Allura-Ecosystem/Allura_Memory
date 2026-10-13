import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { assessCompletion, completionSchema, type CompletionRecord } from "./completion";
import { verifyLocalArtifact } from "./artifacts";

const revision = "tested-worktree-sha256";
const hash = createHash("sha256").update("real test fixture output\n").digest("hex");
const repo = resolve(import.meta.dirname, "../../..");
let root: string;

function record(): CompletionRecord {
  return {
    version: 1, objective: "Exercise the gate", scope: ["Local fixture"], outOfScope: [],
    revision, state: "done", blockers: [], nextAction: "",
    acceptance: [{ id: "AC-1", text: "Gate is tested", evidenceIds: ["test"] }],
    checks: ["test", "review", "docs"].map(kind => ({
      id: kind, kind: kind as "test" | "review" | "docs", status: "pass", revision,
      artifact: { path: "receipt.txt", sha256: hash },
    })),
  };
}
function assess(value: unknown, expected = revision) {
  return assessCompletion(value, expected, artifact => verifyLocalArtifact(root, artifact));
}
function cli(value: unknown, expected = revision) {
  const path = join(root, "record.json");
  writeFileSync(path, JSON.stringify(value));
  return spawnSync("bun", [join(repo, "scripts/team-ram-framework.ts"), path, expected, root], {
    encoding: "utf8", cwd: repo,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ram-framework-test-"));
  writeFileSync(join(root, "receipt.txt"), "real test fixture output\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("Team RAM completion", () => {
  it("accepts fully evidenced completion without modifying the record", () => {
    const input = record();
    const before = structuredClone(input);
    expect(assess(input)).toEqual({ valid: true, complete: true, issues: [] });
    expect(input).toEqual(before);
  });
  it.each([null, {}, { ...record(), unexpected: true }, { ...record(), objective: "  " }])(
    "rejects malformed input %#", input => expect(assess(input).valid).toBe(false),
  );
  const incomplete: [string, (r: CompletionRecord) => void][] = [
    ["unlinked acceptance", r => { r.acceptance[0].evidenceIds = []; }],
    ["dangling evidence", r => { r.acceptance[0].evidenceIds = ["missing"]; }],
    ["duplicate acceptance IDs", r => { r.acceptance.push(structuredClone(r.acceptance[0])); }],
    ["duplicate check IDs", r => { r.checks.push(structuredClone(r.checks[0])); }],
    ["failed test", r => { r.checks[0].status = "fail"; }],
    ["pending review", r => { r.checks[1].status = "pending"; }],
    ["stale check", r => { r.checks[0].revision = "old"; }],
    ["missing receipt", r => { r.checks[0].artifact = null; }],
    ["missing test category", r => { r.checks[0].kind = "acceptance"; }],
    ["missing review category", r => { r.checks[1].kind = "acceptance"; }],
    ["missing docs category", r => { r.checks[2].kind = "acceptance"; }],
    ["unresolved blocker", r => { r.blockers.push("Credential unavailable"); }],
    ["remaining work", r => { r.nextAction = "Finish integration"; }],
    ["active state", r => { r.state = "active"; r.nextAction = "Review"; }],
    ["blocked state", r => { r.state = "blocked"; }],
    ["missing all evidence", r => { r.checks = []; }],
  ];
  it.each(incomplete)("does not complete with %s", (_label, mutate) => {
    const input = record();
    mutate(input);
    const result = assess(input);
    expect(result.valid).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it("does not reuse receipts for a different snapshot", () => {
    expect(assess(record(), "changed-worktree").complete).toBe(false);
    expect(assess(record(), "  ").complete).toBe(false);
  });
  it("retains the unfinished third epic criterion", () => {
    const input = record();
    input.acceptance.push(
      { id: "AC-2", text: "Second slice", evidenceIds: ["test"] },
      { id: "AC-3", text: "Third slice", evidenceIds: [] },
    );
    expect(assess(input).issues).toContain("AC-3: no acceptance evidence");
  });
  it("explains missing recovery information on a blocked record", () => {
    expect(assess({ ...record(), state: "blocked" }).issues).toEqual(expect.arrayContaining([
      "Blocked state requires a blocker", "Incomplete record requires a next action",
    ]));
  });
  it("fails closed when an artifact verifier throws", () => {
    expect(assessCompletion(record(), revision, () => { throw new Error("failure"); }).complete).toBe(false);
  });
  it("keeps the generated JSON Schema in sync with the parser", () => {
    const schema = JSON.parse(readFileSync(join(repo, "json-schema/framework-completion.schema.json"), "utf8"));
    expect(schema).toEqual(z.toJSONSchema(completionSchema));
  });
  it("the starter cannot accidentally claim done", () => {
    const starter = JSON.parse(readFileSync(join(repo, ".opencode/skills/team-ram-framework/assets/completion-record.json"), "utf8"));
    expect(assess(starter).valid).toBe(true);
    expect(assess(starter).complete).toBe(false);
  });
});

describe("local evidence integrity", () => {
  it("detects changed contents", () => {
    writeFileSync(join(root, "receipt.txt"), "changed");
    expect(assess(record()).issues).toContain("test: Artifact SHA-256 mismatch");
  });
  it.each(["missing.txt", ".", "../outside.txt", "/etc/passwd"])("rejects unsafe/unavailable path %s", path => {
    expect(verifyLocalArtifact(root, { path, sha256: hash })).not.toBeNull();
  });
  it("rejects symlinks resolving outside the root", () => {
    symlinkSync(tmpdir(), join(root, "escape"));
    expect(verifyLocalArtifact(root, { path: "escape", sha256: hash })).toBe("Artifact escapes its root");
  });
  it("rejects an existing file outside the selected artifact root", () => {
    const nestedRoot = join(root, "nested");
    mkdirSync(nestedRoot);
    expect(verifyLocalArtifact(nestedRoot, { path: "../receipt.txt", sha256: hash })).toBe("Artifact escapes its root");
  });
  it("rejects a directory inside the root", () => {
    mkdirSync(join(root, "directory"));
    expect(verifyLocalArtifact(root, { path: "directory", sha256: hash })).toBe("Artifact must be a nonempty regular file");
  });
  it("accepts a symlink whose resolved file remains inside the root", () => {
    symlinkSync("receipt.txt", join(root, "receipt-link.txt"));
    expect(verifyLocalArtifact(root, { path: "receipt-link.txt", sha256: hash })).toBeNull();
  });
  it("rejects empty files", () => {
    writeFileSync(join(root, "empty.txt"), "");
    expect(verifyLocalArtifact(root, { path: "empty.txt", sha256: hash })).not.toBeNull();
  });
});

describe("CLI", () => {
  it("returns 0 and JSON only for complete manifests", () => {
    const result = cli(record());
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).complete).toBe(true);
  });
  it("returns 1 for valid but incomplete manifests", () => {
    expect(cli({ ...record(), state: "active", nextAction: "Continue" }).status).toBe(1);
  });
  it("returns 2 for schema-invalid input", () => expect(cli({}).status).toBe(2));
  it("returns 2 for invalid JSON", () => {
    const path = join(root, "bad.json");
    writeFileSync(path, "not-json");
    expect(spawnSync("bun", [join(repo, "scripts/team-ram-framework.ts"), path, revision]).status).toBe(2);
  });
  it("returns 2 when required arguments are missing", () => {
    expect(spawnSync("bun", [join(repo, "scripts/team-ram-framework.ts")]).status).toBe(2);
  });
  it("returns 2 for extra arguments and missing record files", () => {
    const script = join(repo, "scripts/team-ram-framework.ts");
    const path = join(root, "record.json");
    writeFileSync(path, JSON.stringify(record()));
    expect(spawnSync("bun", [script, path, revision, root, "extra"]).status).toBe(2);
    expect(spawnSync("bun", [script, join(root, "missing.json"), revision, root]).status).toBe(2);
  });
  it("defaults the artifact root to the calling directory", () => {
    const path = join(root, "record.json");
    writeFileSync(path, JSON.stringify(record()));
    expect(spawnSync("bun", [join(repo, "scripts/team-ram-framework.ts"), path, revision], { cwd: root }).status).toBe(0);
  });
});
