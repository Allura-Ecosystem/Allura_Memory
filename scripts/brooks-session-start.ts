#!/usr/bin/env bun
/**
 * Brooks Session Start — Complete Activation System
 *
 * The surgical team's entry point. Activates:
 * 1. Memory hydration from Allura Brain
 * 2. 5-minute auto-save checkpoints
 * 3. Interactive command menu
 *
 * Usage: bun run scripts/brooks-session-start.ts [--group-id <id>]
 */

import * as fs from "fs/promises";
import * as path from "path";
import { canonicalizeAgentId } from "../src/lib/agents/canonical-identity";
import { closePool, getPool } from "../src/lib/postgres/connection";
import { createCheckpointManager } from "../src/lib/session/checkpoint-manager";
import { SessionBootstrap } from "../src/lib/session/session-bootstrap";

// Session configuration
const SESSION_CONFIG = {
  checkpointDir: ".opencode/state/checkpoints",
  checkpointInterval: 5 * 60 * 1000, // 5 minutes
  maxCheckpoints: 10,
  enableDbPersistence: true,
  memoryBankDir: "memory-bank",
  groupId: process.env.GROUP_ID || "allura-system",
};

// Command menu
const MENU = `
╔═══════════════════════════════════════════════════════════════╗
║                    ALLURA MEMORY MENU                        ║
╠═══════════════════════════════════════════════════════════════╣
║  [1] 🚀 Start Session      — Load memory, verify infra       ║
║  [2] 📋 Create Task        — Generate structured task         ║
║  [3] 🎉 Party Mode         — Launch parallel agents           ║
║  [4] 📝 Quick Update        — Sync docs with memory            ║
║  [5] 🔍 Code Review        — Surgical team review             ║
║  [6] 📊 Dashboard           — View system status               ║
║  [7] 🧠 Memory Query       — Search Allura Brain              ║
║  [8] 📤 Promote            — HITL promotion workflow           ║
║  [9] 🏁 End Session        — Persist and archive              ║
║  [0] ❓ Help               — Show this menu                    ║
╚═══════════════════════════════════════════════════════════════╝

Quick prompts: start | task <desc> | party <task> | update <target>
               review | dash | query <term> | promote | end <summary>
`;

interface SessionContext {
  sessionId: string;
  groupId: string;
  checkpointManager: ReturnType<typeof createCheckpointManager>;
  bootstrap: SessionBootstrap;
  startTime: Date;
  currentPhase: string;
}

let sessionContext: SessionContext | null = null;

/**
 * Generate session ID with timestamp for traceability
 */
function generateSessionId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const uuid = crypto.randomUUID().slice(0, 8);
  return `${timestamp}-${uuid}`;
}

/**
 * Log event to PostgreSQL (append-only)
 */
async function logEvent(
  eventType: string,
  status: "pending" | "completed" | "failed",
  metadata: Record<string, unknown>
): Promise<void> {
  const pool = getPool();
  const agentId = canonicalizeAgentId("brooks");

  await pool.query(
    `INSERT INTO events (event_type, group_id, agent_id, status, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [eventType, SESSION_CONFIG.groupId, agentId, status, JSON.stringify(metadata)]
  );
}

/**
 * Hydrate memory from memory-bank files
 */
async function hydrateMemory(): Promise<{
  activeContext: string | null;
  progress: string | null;
  systemPatterns: string | null;
  techContext: string | null;
}> {
  const memoryBankPath = path.join(process.cwd(), SESSION_CONFIG.memoryBankDir);

  const files = {
    activeContext: "activeContext.md",
    progress: "progress.md",
    systemPatterns: "systemPatterns.md",
    techContext: "techContext.md",
  };

  const results: { activeContext: string | null; progress: string | null; systemPatterns: string | null; techContext: string | null } = {
    activeContext: null,
    progress: null,
    systemPatterns: null,
    techContext: null,
  };

  for (const [key, filename] of Object.entries(files)) {
    try {
      const content = await fs.readFile(
        path.join(memoryBankPath, filename),
        "utf-8"
      );
      (results as Record<string, string | null>)[key] = content.slice(0, 2000); // First 2000 chars for context
    } catch {
      (results as Record<string, string | null>)[key] = null;
    }
  }

  return results;
}

/**
 * Verify infrastructure health
 */
async function verifyInfrastructure(): Promise<{
  postgres: boolean;
  checkpointDir: boolean;
}> {
  const results = {
    postgres: false,
    checkpointDir: false,
  };

  // Check PostgreSQL
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    results.postgres = true;
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:", error);
  }

  // Check checkpoint directory
  try {
    await fs.mkdir(SESSION_CONFIG.checkpointDir, { recursive: true });
    const stat = await fs.stat(SESSION_CONFIG.checkpointDir);
    results.checkpointDir = stat.isDirectory();
  } catch (error) {
    console.error("❌ Checkpoint directory creation failed:", error);
  }

  return results;
}

/**
 * Initialize complete session with auto-save
 */
async function initializeSession(): Promise<SessionContext> {
  console.log("\n🏗️  Brooks Session Initialization\n");

  const sessionId = generateSessionId();
  console.log(`📋 Session ID: ${sessionId}`);
  console.log(`👥 Group ID: ${SESSION_CONFIG.groupId}`);

  // Step 1: Verify infrastructure
  console.log("\n🔍 Verifying infrastructure...");
  const health = await verifyInfrastructure();
  console.log(`   PostgreSQL: ${health.postgres ? "✅" : "❌"}`);
  console.log(`   Checkpoint Dir: ${health.checkpointDir ? "✅" : "❌"}`);

  // Step 2: Hydrate memory
  console.log("\n🧠 Hydrating memory...");
  const memory = await hydrateMemory();
  const hydratedFiles = Object.entries(memory)
    .filter(([, content]) => content !== null)
    .map(([name]) => name);
  console.log(`   Loaded: ${hydratedFiles.join(", ") || "none"}`);

  // Step 3: Initialize checkpoint manager (auto-save every 5 minutes)
  console.log("\n💾 Initializing auto-save (5-minute checkpoints)...");
  const checkpointManager = createCheckpointManager({
    checkpointDir: SESSION_CONFIG.checkpointDir,
    checkpointInterval: SESSION_CONFIG.checkpointInterval,
    maxCheckpoints: SESSION_CONFIG.maxCheckpoints,
    enableDbPersistence: SESSION_CONFIG.enableDbPersistence,
  });

  await checkpointManager.initialize(sessionId, SESSION_CONFIG.groupId);
  console.log("   ✅ Auto-save active");

  // Step 4: Create initial checkpoint
  const initialCheckpointId = await checkpointManager.createCheckpoint(
    sessionId,
    SESSION_CONFIG.groupId,
    "WAITING",
    { hydratedFiles, health }
  );
  console.log(`   📝 Initial checkpoint: ${initialCheckpointId.slice(0, 8)}...`);

  // Step 5: Initialize session bootstrap
  const bootstrap = new SessionBootstrap({
    groupId: SESSION_CONFIG.groupId,
    sessionId,
    enableCheckpoints: true,
  });

  // Step 6: Log session start
  await logEvent("SESSION_START", "completed", {
    sessionId,
    groupId: SESSION_CONFIG.groupId,
    hydratedFiles,
    health,
    initialCheckpointId,
  });

  console.log("\n✅ Session initialized successfully!");
  console.log(`   Auto-save: Every 5 minutes`);
  console.log(`   Checkpoints: ${SESSION_CONFIG.checkpointDir}`);

  sessionContext = {
    sessionId,
    groupId: SESSION_CONFIG.groupId,
    checkpointManager,
    bootstrap,
    startTime: new Date(),
    currentPhase: "WAITING",
  };

  return sessionContext;
}

/**
 * Update current phase (for checkpoint tracking)
 */
async function setPhase(phase: string): Promise<void> {
  if (!sessionContext) {
    console.error("❌ No active session");
    return;
  }

  sessionContext.currentPhase = phase;

  // Create checkpoint on phase change
  await sessionContext.checkpointManager.createCheckpoint(
    sessionContext.sessionId,
    sessionContext.groupId,
    phase as any,
    { phaseChanged: true, previousPhase: sessionContext.currentPhase }
  );

  console.log(`🔄 Phase updated: ${phase}`);
}

/**
 * End session gracefully
 */
async function endSession(summary: string): Promise<void> {
  if (!sessionContext) {
    console.error("❌ No active session to end");
    return;
  }

  console.log("\n🏁 Ending session...");

  // Create final checkpoint
  const finalCheckpointId = await sessionContext.checkpointManager.createCheckpoint(
    sessionContext.sessionId,
    sessionContext.groupId,
    "RETROSPECTIVE",
    { summary, duration: Date.now() - sessionContext.startTime.getTime() }
  );

  // Stop auto-save
  sessionContext.checkpointManager.stopCheckpointTimer();

  // Log session end
  await logEvent("SESSION_END", "completed", {
    sessionId: sessionContext.sessionId,
    summary,
    finalCheckpointId,
    durationMinutes: Math.floor((Date.now() - sessionContext.startTime.getTime()) / 60000),
  });

  // Close database connections
  await closePool();

  console.log(`✅ Session ended: ${sessionContext.sessionId}`);
  console.log(`📝 Final checkpoint: ${finalCheckpointId.slice(0, 8)}...`);
  console.log(`⏱️  Duration: ${Math.floor((Date.now() - sessionContext.startTime.getTime()) / 60000)} minutes`);

  sessionContext = null;
}

/**
 * Show current checkpoint status
 */
async function showCheckpointStatus(): Promise<void> {
  if (!sessionContext) {
    console.error("❌ No active session");
    return;
  }

  const checkpoints = await sessionContext.checkpointManager.listCheckpoints(
    sessionContext.sessionId
  );

  console.log("\n📊 Checkpoint Status");
  console.log(`   Session: ${sessionContext.sessionId}`);
  console.log(`   Phase: ${sessionContext.currentPhase}`);
  console.log(`   Checkpoints: ${checkpoints.length}`);

  if (checkpoints.length > 0) {
    console.log("\n   Recent checkpoints:");
    checkpoints.slice(0, 5).forEach((cp, i) => {
      const time = new Date(cp.timestamp).toLocaleTimeString();
      console.log(`   ${i + 1}. ${time} — ${cp.phase}`);
    });
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const groupIdFlag = args.find((arg) => arg.startsWith("--group-id="));
  if (groupIdFlag) {
    SESSION_CONFIG.groupId = groupIdFlag.split("=")[1];
  }

  console.log(MENU);

  try {
    // Initialize session with auto-save
    await initializeSession();

    // Show checkpoint status
    await showCheckpointStatus();

    console.log("\n💡 Commands:");
    console.log("   await setPhase('DEV')     — Update phase");
    console.log("   await showCheckpointStatus() — Check auto-save");
    console.log("   await endSession('summary')   — End session");
    console.log("\n🔄 Auto-save is running every 5 minutes...");

    // Keep process alive for auto-save timer
    process.on("SIGINT", async () => {
      console.log("\n\n⚠️  Interrupted — creating final checkpoint...");
      await endSession("Interrupted by user");
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await endSession("Process terminated");
      process.exit(0);
    });
  } catch (error) {
    console.error("\n❌ Session initialization failed:", error);
    await logEvent("SESSION_START", "failed", { error: String(error) });
    await closePool();
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}

export { initializeSession, setPhase, endSession, showCheckpointStatus, SESSION_CONFIG };
