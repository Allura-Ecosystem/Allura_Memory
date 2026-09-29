#!/usr/bin/env bun
/**
 * Log Session to Memory
 * Records session completion to the PostgreSQL events table (append-only)
 */

import { getPool } from "../src/lib/postgres/connection";
import { insertEvent } from "../src/lib/postgres/queries/insert-trace";

const sessionData = {
  session_id: "ralph-loop-epic-1-complete-2026-04-06",
  agent_id: "memory-orchestrator",
  group_id: "allura-system",
  stories_completed: ["1.1", "1.2", "1.5", "1.6", "1.7"],
  commits: [
    "10579e07",
    "f1393b7a",
    "c0bf9353",
    "4ded5ce0",
    "6987b7a9",
    "4060bf94",
  ],
  summary: "Completed Epic 1: Persistent Knowledge Capture (5 stories)",
  timestamp: new Date().toISOString(),
};

async function logToPostgres() {
  console.log("[SessionLogger] Logging to PostgreSQL...");

  const event = await insertEvent({
    group_id: sessionData.group_id,
    event_type: "session.complete",
    agent_id: sessionData.agent_id,
    metadata: {
      session_id: sessionData.session_id,
      stories_completed: sessionData.stories_completed,
      commit_count: sessionData.commits.length,
    },
    outcome: {
      summary: sessionData.summary,
      commits: sessionData.commits,
      status: "success",
    },
    status: "completed",
    confidence: 1.0,
  });

  console.log(`[SessionLogger] PostgreSQL event logged: ${event.id}`);
  return event.id;
}

async function main() {
  try {
    console.log("=== Session Logger ===");
    console.log(`Session: ${sessionData.session_id}`);
    console.log(`Stories: ${sessionData.stories_completed.join(", ")}`);
    console.log("");

    // Log to PostgreSQL
    const eventId = await logToPostgres();

    console.log("");
    console.log("=== Session Logged Successfully ===");
    console.log(`PostgreSQL Event ID: ${eventId}`);

    process.exit(0);
  } catch (error) {
    console.error("[SessionLogger] Failed:", error);
    process.exit(1);
  }
}

main();
