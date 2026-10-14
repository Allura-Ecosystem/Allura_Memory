import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { isBuiltin } from "node:module";
import ts from "typescript";
import { buildGateway } from "./build-gateway";

type Lock = { packages: Record<string, unknown[]> };
type Edges = { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalPeers?: string[] };

function assertSameLockedClosure(root: Lock, candidate: Lock, entries: string[]) {
  function resolveKey(lock: Lock, importer: string, dependency: string): string | undefined {
    let current = importer;
    while (current) {
      const key = `${current}/${dependency}`;
      if (lock.packages[key]) return key;
      current = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
    }
    return lock.packages[dependency] ? dependency : undefined;
  }
  const visited = new Set<string>();
  function visit(rootParent: string, candidateParent: string, dependency: string, optional = false) {
    const left = resolveKey(root, rootParent, dependency);
    const right = resolveKey(candidate, candidateParent, dependency);
    if (!left || !right) {
      if (!(optional && !left && !right)) throw new Error(`Missing or changed dependency edge: ${rootParent} -> ${dependency}`);
      return;
    }
    const pair = JSON.stringify([left, right]);
    if (visited.has(pair)) return;
    visited.add(pair);
    expect(candidate.packages[right]).toEqual(root.packages[left]);
    const edges = (root.packages[left][2] ?? {}) as Edges;
    for (const name of new Set(Object.keys({ ...edges.dependencies, ...edges.optionalDependencies, ...edges.peerDependencies }))) {
      const optionalChild = Object.hasOwn(edges.optionalDependencies ?? {}, name) || (edges.optionalPeers ?? []).includes(name);
      visit(left, right, name, optionalChild);
    }
  }
  for (const entry of entries) visit("", "", entry);
}

describe("HTTP gateway packaging candidate", () => {
  test("rejects relative output without modifying it", async () => {
    await expect(buildGateway("dist")).rejects.toThrow("must be absolute");
  });

  test("refuses an existing destination and preserves its contents", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allura-gateway-existing-"));
    await writeFile(join(dir, "sentinel"), "preserve");
    await expect(buildGateway(dir)).rejects.toThrow();
    expect(await readFile(join(dir, "sentinel"), "utf8")).toBe("preserve");
  });

  test("refuses a symlink destination", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allura-gateway-link-"));
    const link = join(dir, "alias");
    await symlink(dir, link);
    await expect(buildGateway(link)).rejects.toThrow();
  });

  test("builds portable local code and verifiable runtime inputs without inlining environment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allura-gateway-build-"));
    const output = join(dir, "candidate");
    const before = process.env.ALLURA_MCP_TOKEN_SECRET;
    process.env.ALLURA_MCP_TOKEN_SECRET = "test-only-do-not-inline-candidate-secret";
    try {
      const receipt = await buildGateway(output);
      for (const [name, artifact] of Object.entries(receipt.artifacts)) {
        const bytes = await readFile(join(output, name));
        expect(bytes.length).toBe(artifact.bytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.sha256);
      }
      const code = await readFile(join(output, "gateway.mjs"), "utf8");
      expect(code).not.toContain("test-only-do-not-inline-candidate-secret");
      const tree = ts.createSourceFile("gateway.mjs", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const specifiers = new Set<string>();
      const opaqueLoads: string[] = [];
      function walk(node: ts.Node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.add(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && ["require", "__require"].includes(node.expression.text)))) {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteral(arg)) specifiers.add(arg.text);
          else opaqueLoads.push(arg?.getText(tree) ?? "missing");
        }
        ts.forEachChild(node, walk);
      }
      walk(tree);
      expect([...specifiers].filter(s => s.startsWith(".") || s.startsWith("@/") || s.startsWith("@allura/") || s.startsWith("/"))).toEqual([]);
      const allowed = Object.keys(receipt.externalDependencies);
      expect([...specifiers].filter(s => !isBuiltin(s) && !allowed.some(p => s === p || s.startsWith(`${p}/`)))).toEqual([]);
      expect(opaqueLoads).toEqual(["modulePath"]); // known optional native RuVector addon
      expect(specifiers.has("pg")).toBe(true);
      expect(specifiers.has("zod/v4")).toBe(true);
      expect(JSON.parse(await readFile(join(output, "build-receipt.json"), "utf8"))).toEqual(receipt);
    } finally {
      if (before === undefined) delete process.env.ALLURA_MCP_TOKEN_SECRET;
      else process.env.ALLURA_MCP_TOKEN_SECRET = before;
    }
  });

  test("candidate lock preserves resolved dependency edges and integrity", async () => {
    const readLock = async (path: URL) => ts.parseConfigFileTextToJson(path.pathname, await readFile(path, "utf8")).config;
    const root = await readLock(new URL("../bun.lock", import.meta.url));
    const candidate = await readLock(new URL("../deploy/gateway/bun.lock", import.meta.url));
    assertSameLockedClosure(root, candidate, ["@modelcontextprotocol/sdk", "dotenv", "pg", "zod"]);
    expect(Object.keys(candidate.packages).length).toBeLessThan(Object.keys(root.packages).length);
  });

  test("closure comparison rejects an edge switching to a version already elsewhere in root", () => {
    const a = ["a@1.0.0", "", { dependencies: { b: "*" } }, "integrity-a"];
    const b1 = ["b@1.0.0", "", {}, "integrity-b1"];
    const b2 = ["b@2.0.0", "", {}, "integrity-b2"];
    const root = { packages: { a, b: b1, "unrelated/b": b2 } };
    const candidate = { packages: { a, b: b2 } };
    expect(() => assertSameLockedClosure(root, candidate, ["a"])).toThrow();
  });
});
