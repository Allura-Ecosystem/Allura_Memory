#!/usr/bin/env bun
/**
 * Curator Workflow Runner
 *
 * Runs the curator workflow for HITL promotion of insights.
 * Usage: bun src/curator/index.ts run
 *
 * Approval: POST /api/curator/approve is the sole approval path.
 * See docs/adr/ADR-003-approve-promotions-deprecation.md
 */



// ── Core Functions ─────────────────────────────────────────────────────────

export async function runCurator() {
  console.log("[Curator] Starting workflow...\n");

  // This legacy CLI has no authenticated principal/token workspace resolver.
  // It must not create workspace-governed proposals until invoked through one.
  throw new Error("curator CLI requires a server-resolved workspace scope");
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1]?.includes("index.ts");
const COMMAND = process.argv[2] || "run";

if (isMainModule) {
  if (COMMAND === "run") {
    runCurator();
  } else {
    console.log("Usage: bun src/curator/index.ts run");
    console.log("Approval: POST /api/curator/approve (see ADR-003)");
    process.exit(1);
  }
}
