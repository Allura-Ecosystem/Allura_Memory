#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { assessCompletion } from "../src/lib/team-ram-framework/completion";
import { verifyLocalArtifact } from "../src/lib/team-ram-framework/artifacts";

const [recordPath, revision, artifactRoot = process.cwd(), ...extra] = process.argv.slice(2);
if (!recordPath || !revision?.trim() || extra.length) {
  console.error("Usage: bun run framework:check <record.json> <expected-revision> [artifact-root]");
  process.exit(2);
}
try {
  const result = assessCompletion(
    JSON.parse(readFileSync(recordPath, "utf8")),
    revision,
    artifact => verifyLocalArtifact(artifactRoot, artifact),
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = !result.valid ? 2 : result.complete ? 0 : 1;
} catch (error) {
  console.error(`Cannot check completion: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
