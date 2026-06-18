import { existsSync, readFileSync } from "node:fs"

const requiredBridgeFiles = [
  "src/lib/ruvector/bridge.ts",
  "src/lib/ruvector/embedding-service.ts",
  "docs/allura/BLUEPRINT.md",
  "docs/allura/SOLUTION-ARCHITECTURE.md",
]

for (const file of requiredBridgeFiles) {
  if (!existsSync(file)) throw new Error(`Missing RuVector readiness artifact: ${file}`)
}

const canonicalDocs = [
  readFileSync("docs/allura/BLUEPRINT.md", "utf8"),
  readFileSync("docs/allura/SOLUTION-ARCHITECTURE.md", "utf8"),
  readFileSync("docs/allura/RISKS-AND-DECISIONS.md", "utf8"),
].join("\n")

if (!canonicalDocs.includes("pgvector bridge")) {
  throw new Error("Canonical docs must retain the current 'pgvector bridge' runtime label")
}

const nativeArtifacts = [
  "packages/ruvector-governance/package.json",
  "docker/ruvector",
  "scripts/ruvector-native-smoke.ts",
]
const presentNativeArtifacts = nativeArtifacts.filter(existsSync)

if (process.env.REQUIRE_RUVECTOR_NATIVE === "true" && presentNativeArtifacts.length !== nativeArtifacts.length) {
  throw new Error(
    `Native/upstream RuVector claim blocked. Missing: ${nativeArtifacts
      .filter((file) => !presentNativeArtifacts.includes(file))
      .join(", ")}`
  )
}

console.log(
  JSON.stringify({
    runtime_label: "pgvector bridge",
    bridge_contract: "present",
    native_artifacts_present: presentNativeArtifacts,
    native_publish_ready: presentNativeArtifacts.length === nativeArtifacts.length,
  })
)
