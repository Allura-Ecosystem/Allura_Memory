#!/usr/bin/env bun
/**
 * Offline, read-only integrity gate for the repository-local BMAD installation.
 * It reads only --root and a committed static registry; it never discovers,
 * installs, updates, renders, or rewrites BMAD content.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

interface HashedFile {
  path: string;
  sha256: string;
  hashSource: string;
}

interface CustomFile extends HashedFile {
  requiredLiterals: string[];
}

interface Registry {
  schemaVersion: number;
  package: {
    name: string;
    version: string;
    modules: string[];
    ides: string[];
  };
  inventory: {
    sharedSkills: {
      primaryRoot: string;
      mirrorRoot: string;
      files: HashedFile[];
    };
    opencodeCommands: {
      root: string;
      files: HashedFile[];
    };
    runtime: {
      root: string;
      files: HashedFile[];
    };
  };
  customization: {
    directory: string;
    expectedFiles: CustomFile[];
    allowedNonTeamFiles: string[];
  };
}

interface Options {
  root: string;
  registry: string;
}

function parseOptions(argv: string[]): Options {
  let root = process.cwd();
  let registry = join(root, "config/bmad-install-integrity.json");
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") root = argv[++index] ?? "";
    else if (value === "--registry") registry = argv[++index] ?? "";
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!root || !registry) throw new Error("--root and --registry require values");
  return { root: resolve(root), registry: resolve(registry) };
}

function normalizeRelative(path: string): string {
  return path.split(sep).join("/");
}

function safePath(root: string, relativePath: string): string {
  const candidate = resolve(root, relativePath);
  const boundary = `${resolve(root)}${sep}`;
  if (candidate !== resolve(root) && !candidate.startsWith(boundary)) {
    throw new Error(`registry path escapes root: ${relativePath}`);
  }
  return candidate;
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        files.push(normalizeRelative(relative(root, path)));
      } else if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(normalizeRelative(relative(root, path)));
      }
    }
  };
  visit(root);
  return files.sort();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function isRegularFile(path: string): boolean {
  return existsSync(path) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink();
}

export function validate(root: string, registry: Registry): string[] {
  const errors = new Set<string>();
  const add = (code: string, detail: string) => errors.add(`${code} ${detail}`);
  const checkHashed = (base: string, entry: HashedFile, displayPrefix: string) => {
    const path = safePath(base, entry.path);
    const display = `${displayPrefix}${entry.path}`;
    if (!isRegularFile(path)) {
      add("MISSING_FILE", display);
      return;
    }
    if (sha256(path) !== entry.sha256) add("HASH_MISMATCH", display);
  };

  const bmadRoot = safePath(root, "_bmad");
  if (!existsSync(bmadRoot) || !lstatSync(bmadRoot).isDirectory()) {
    add("BMAD_ROOT_MISSING", "_bmad");
  }

  const skills = registry.inventory.sharedSkills;
  const primaryRoot = safePath(root, skills.primaryRoot);
  const mirrorRoot = safePath(root, skills.mirrorRoot);
  const expectedSkillFiles = new Set(skills.files.map((entry) => entry.path));
  for (const entry of skills.files) {
    checkHashed(primaryRoot, entry, `${skills.primaryRoot}/`);
    checkHashed(mirrorRoot, entry, `${skills.mirrorRoot}/`);
    const primary = safePath(primaryRoot, entry.path);
    const mirror = safePath(mirrorRoot, entry.path);
    if (isRegularFile(primary) && isRegularFile(mirror) && sha256(primary) !== sha256(mirror)) {
      add("ADAPTER_PARITY", entry.path);
    }
  }
  for (const [base, label] of [[primaryRoot, skills.primaryRoot], [mirrorRoot, skills.mirrorRoot]] as const) {
    for (const path of walkFiles(base)) {
      if (path.split("/")[0]?.startsWith("bmad-") && !expectedSkillFiles.has(path)) {
        add("UNEXPECTED_BMAD_FILE", `${label}/${path}`);
      }
    }
  }

  const commands = registry.inventory.opencodeCommands;
  const commandsRoot = safePath(root, commands.root);
  const expectedCommands = new Set(commands.files.map((entry) => entry.path));
  for (const entry of commands.files) {
    checkHashed(commandsRoot, entry, `${commands.root}/`);
    const commandPath = safePath(commandsRoot, entry.path);
    if (!isRegularFile(commandPath)) continue;
    const text = readFileSync(commandPath, "utf8");
    const references = [...text.matchAll(/@skills\/([A-Za-z0-9._-]+)/g)].map((match) => match[1]);
    const commandName = basename(entry.path, ".md");
    const target = references.length === 1 ? references[0] : undefined;
    if (
      target !== commandName
      || !isRegularFile(safePath(primaryRoot, `${target ?? ""}/SKILL.md`))
      || !isRegularFile(safePath(mirrorRoot, `${target ?? ""}/SKILL.md`))
    ) {
      add("ADAPTER_UNRESOLVED", `${commands.root}/${entry.path}`);
    }
  }
  for (const path of walkFiles(commandsRoot)) {
    if (/^bmad-[^/]+\.md$/.test(path) && !expectedCommands.has(path)) {
      add("UNEXPECTED_BMAD_FILE", `${commands.root}/${path}`);
    }
  }

  const runtime = registry.inventory.runtime;
  const runtimeRoot = safePath(root, runtime.root);
  const expectedRuntime = new Set(runtime.files.map((entry) => entry.path));
  for (const entry of runtime.files) checkHashed(runtimeRoot, entry, `${runtime.root}/`);

  const customPaths = new Set(
    registry.customization.expectedFiles.map((entry) => normalizeRelative(relative(runtimeRoot, safePath(root, entry.path)))),
  );
  for (const entry of registry.customization.expectedFiles) {
    const path = safePath(root, entry.path);
    if (!isRegularFile(path)) {
      add("CUSTOM_MISSING", entry.path);
      continue;
    }
    if (sha256(path) !== entry.sha256) add("CUSTOM_HASH_MISMATCH", entry.path);
    const text = readFileSync(path, "utf8");
    if (entry.requiredLiterals.some((literal) => !text.includes(literal))) {
      add("CUSTOM_ROUTING_INVALID", entry.path);
    }
  }

  const customRoot = safePath(root, registry.customization.directory);
  const allowedCustom = new Set(registry.customization.allowedNonTeamFiles);
  for (const path of walkFiles(customRoot)) {
    if (path.endsWith(".user.toml")) continue;
    const runtimeRelative = normalizeRelative(relative(runtimeRoot, safePath(customRoot, path)));
    if (path.endsWith(".toml") && !allowedCustom.has(path) && !customPaths.has(runtimeRelative)) {
      add("CUSTOM_UNEXPECTED", `${registry.customization.directory}/${path}`);
    }
  }

  const ignoredRuntime = (path: string) => (
    path === "config.user.toml"
    || path.startsWith("render/")
    || path.includes("/__pycache__/")
    || path.endsWith(".pyc")
    || (path.startsWith("custom/") && path.endsWith(".toml"))
  );
  for (const path of walkFiles(runtimeRoot)) {
    if (ignoredRuntime(path) || customPaths.has(path)) continue;
    if (!expectedRuntime.has(path)) add("UNEXPECTED_BMAD_FILE", `${runtime.root}/${path}`);
  }

  const manifestPath = safePath(root, "_bmad/_config/manifest.yaml");
  if (isRegularFile(manifestPath)) {
    const manifest = readFileSync(manifestPath, "utf8");
    const versions = [...manifest.matchAll(/^\s*version:\s*([^\s#]+)\s*$/gm)].map((match) => match[1]);
    if (versions.length !== 3 || versions.some((version) => version !== registry.package.version)) {
      add("VERSION_MISMATCH", `expected ${registry.package.version}; found ${versions.join(",") || "none"}`);
    }
    for (const moduleName of registry.package.modules) {
      const modulePattern = new RegExp(`^\\s*- name: ${moduleName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "m");
      if (!modulePattern.test(manifest)) add("MANIFEST_STATE_INVALID", `missing module ${moduleName}`);
    }
    for (const ide of registry.package.ides) {
      const idePattern = new RegExp(`^\\s*- ${ide.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "m");
      if (!idePattern.test(manifest)) add("MANIFEST_STATE_INVALID", `missing IDE ${ide}`);
    }
  }

  return [...errors].sort();
}

function main(): void {
  let options: Options;
  let registry: Registry;
  try {
    options = parseOptions(process.argv.slice(2));
    registry = JSON.parse(readFileSync(options.registry, "utf8")) as Registry;
  } catch (error) {
    console.error(`REGISTRY_INVALID ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }

  if (registry.schemaVersion !== 1) {
    console.error(`REGISTRY_INVALID unsupported schemaVersion ${String(registry.schemaVersion)}`);
    process.exit(2);
  }

  const errors = validate(options.root, registry);
  if (errors.length > 0) {
    console.error(`BMAD_INTEGRITY_FAILED errors=${errors.length}`);
    for (const error of errors) console.error(`ERROR ${error}`);
    process.exit(1);
  }

  console.log(
    `BMAD_INTEGRITY_OK version=${registry.package.version}`
    + ` skills=${registry.inventory.sharedSkills.files.length}`
    + ` commands=${registry.inventory.opencodeCommands.files.length}`
    + ` runtime=${registry.inventory.runtime.files.length}`
    + ` custom=${registry.customization.expectedFiles.length}`,
  );
}

if (import.meta.main) main();
