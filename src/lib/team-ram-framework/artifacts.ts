import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Artifact } from "./completion";

/** Read-only integrity check. Never interprets artifacts as executable content. */
export function verifyLocalArtifact(root: string, artifact: Artifact): string | null {
  if (isAbsolute(artifact.path)) return "Artifact path must be relative";
  let descriptor: number | undefined;
  try {
    const canonicalRoot = realpathSync(root);
    const path = realpathSync(resolve(canonicalRoot, artifact.path));
    const rel = relative(canonicalRoot, path);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      return "Artifact escapes its root";
    // Pin the opened file and refuse a last-component symlink swap or FIFO wait.
    // This is a local integrity aid, not a hostile-filesystem sandbox.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    if (!fstatSync(descriptor).isFile()) return "Artifact must be a nonempty regular file";
    const bytes = readFileSync(descriptor);
    if (!bytes.length) return "Artifact must be a nonempty regular file";
    const actual = createHash("sha256").update(bytes).digest("hex");
    return actual === artifact.sha256 ? null : "Artifact SHA-256 mismatch";
  } catch {
    return "Artifact is unavailable";
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
