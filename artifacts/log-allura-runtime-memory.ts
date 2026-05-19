import { memory_add, memory_search } from "../src/mcp/canonical-tools"

const content =
  "/allura runtime trust verification on 2026-05-16: clean localhost:3334 dev preview passes, standalone production preview on 3335 passes, browser smoke verifies tabs/search/keyboard/no-overflow, benchmarks pass (OAC 47/47, governance, ESLint, typecheck, 21/21 targeted tests, build with known NFT warning). TALON and IRIS review lanes timed out without usable approval, so review gates remain open and Kanban must stay In Review until Ralph/team approval."

const search = await memory_search({
  group_id: "allura-system",
  user_id: "gilliam",
  query: "allura runtime trust verification 2026-05-16 localhost 3334 TALON IRIS timed out",
  limit: 3,
})

console.log("search", JSON.stringify(search, null, 2))

const added = await memory_add({
  group_id: "allura-system",
  user_id: "gilliam",
  content,
  metadata: {
    agent_id: "gilliam",
    project: "allura-memory",
    event: "allura_runtime_trust_verification",
    evidence_files: [
      "artifacts/allura-runtime-trust-evidence-2026-05-16.md",
      "artifacts/allura-playwright-smoke.json",
      "artifacts/allura-benchmark-2026-05-16.log",
      "artifacts/allura-after-3334.png",
    ],
    status: "technical_verification_passed_review_pending",
    tags: ["allura", "runtime-trust", "prompt-library", "evidence"],
  },
})

console.log("added", JSON.stringify(added, null, 2))
