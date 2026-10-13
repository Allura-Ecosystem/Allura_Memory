#!/usr/bin/env bun
/**
 * Log Session to Memory
 * Records session completion to PostgreSQL events + Neo4j knowledge graph
 */

import { memory } from "../src/lib/memory/writer";
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

async function logToNeo4j() {
  console.log("[SessionLogger] Logging to Neo4j...");

  const mem = memory();
  const workspaceId = process.env.ALLURA_WORKSPACE_ID?.trim();
  if (!workspaceId) throw new Error("ALLURA_WORKSPACE_ID is required for scoped graph writes");
  const verifiedScope = {
    group_id: sessionData.group_id,
    workspace_id: workspaceId,
    principal_id: sessionData.agent_id,
  };

  // Create Session node
  const { node_id: sessionId } = await mem.createEntity({
    label: "Session",
    ...verifiedScope,
    props: {
      session_id: sessionData.session_id,
      type: "epic_completion",
      stories_completed: sessionData.stories_completed.length,
      summary: sessionData.summary,
      completed_at: sessionData.timestamp,
    },
  });

  // Create CONTRIBUTED relationship
  await mem.createRelationship({
    fromId: sessionData.agent_id,
    fromLabel: "Agent",
    toId: sessionId,
    toLabel: "Session",
    type: "CONTRIBUTED",
    ...verifiedScope,
    props: {
      on: sessionData.timestamp,
      result: "complete",
    },
  });

  // Create LEARNED relationships for each story type
  const storyLearnings = [
    { entityId: "story-1.1", entityLabel: "Task" as const, relevance: 0.9 },
    { entityId: "story-1.7", entityLabel: "Task" as const, relevance: 0.85 },
    { entityId: "story-1.2", entityLabel: "Task" as const, relevance: 0.8 },
    { entityId: "story-1.5", entityLabel: "Task" as const, relevance: 0.75 },
    { entityId: "story-1.6", entityLabel: "Task" as const, relevance: 0.75 },
  ];

  for (const learning of storyLearnings) {
    await mem.createRelationship({
      fromId: sessionData.agent_id,
      fromLabel: "Agent",
      toId: learning.entityId,
      toLabel: learning.entityLabel,
      type: "LEARNED",
      ...verifiedScope,
      props: {
        timestamp: sessionData.timestamp,
        relevance_score: learning.relevance,
        context: `Completed story ${learning.entityId}`,
        session_id: sessionData.session_id,
      },
    });
  }

  console.log(`[SessionLogger] Neo4j Session node created: ${sessionId}`);
  return sessionId;
}

async function main() {
  try {
    console.log("=== Session Logger ===");
    console.log(`Session: ${sessionData.session_id}`);
    console.log(`Stories: ${sessionData.stories_completed.join(", ")}`);
    console.log("");

    // Log to PostgreSQL
    const eventId = await logToPostgres();

    // Log to Neo4j
    const sessionNodeId = await logToNeo4j();

    console.log("");
    console.log("=== Session Logged Successfully ===");
    console.log(`PostgreSQL Event ID: ${eventId}`);
    console.log(`Neo4j Session Node: ${sessionNodeId}`);

    process.exit(0);
  } catch (error) {
    console.error("[SessionLogger] Failed:", error);
    process.exit(1);
  }
}

main();
