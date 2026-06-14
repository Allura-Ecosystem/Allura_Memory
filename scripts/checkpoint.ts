#!/usr/bin/env bun
/**
 * Standalone Checkpoint Tool - No Brain, No MCP, No Skills
 * 
 * Simple file-based session checkpoints for local development.
 * No PostgreSQL, No Neo4j, No MCP Docker, No Skills required.
 * 
 * Usage:
 *   bun run scripts/checkpoint.ts create --story "Fix login bug"
 *   bun run scripts/checkpoint.ts load
 *   bun run scripts/checkpoint.ts list
 *   bun run scripts/checkpoint.ts auto --interval 300  # Auto-save every 5 min
 */

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { gitExec } from '../src/lib/git/exec';

// Simple checkpoint schema - no external dependencies
const CheckpointSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  story: z.string().optional(),
  epic: z.string().optional(),
  phase: z.enum(['DEV', 'CODE_REVIEW', 'CORRECT_COURSE', 'BLOOD_LOOP', 'RETROSPECTIVE', 'WAITING']),
  files: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

type Checkpoint = z.infer<typeof CheckpointSchema>;

const CHECKPOINT_DIR = '.opencode/state/checkpoints';
const SESSION_FILE = '.opencode/state/session.json';

// Ensure checkpoint directory exists
async function ensureDir() {
  await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
}

// Get current session or create new
async function getSession(): Promise<{ sessionId: string; lastCheckpoint: string | null }> {
  try {
    const content = await fs.readFile(SESSION_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    const sessionId = crypto.randomUUID();
    const session = { sessionId, lastCheckpoint: null };
    await fs.mkdir('.opencode/state', { recursive: true });
    await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2));
    return session;
  }
}

// Save session
async function saveSession(session: { sessionId: string; lastCheckpoint: string | null }) {
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2));
}

// Create checkpoint
async function createCheckpoint(
  story?: string,
  epic?: string,
  phase: Checkpoint['phase'] = 'DEV',
  notes?: string
): Promise<Checkpoint> {
  await ensureDir();
  const session = await getSession();
  
  const checkpoint: Checkpoint = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    story,
    epic,
    phase,
    files: [],
    notes,
  };

  // Get recently modified files (last 5 minutes)
  try {
    const gitStatus = gitExec(["diff", "--name-only"]);
    checkpoint.files = gitStatus.split('\n').filter(f => f.trim());
  } catch {
    // Git not available or not a repo
  }

  const filePath = path.join(CHECKPOINT_DIR, `${checkpoint.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
  
  session.lastCheckpoint = checkpoint.id;
  await saveSession(session);

  console.log(`✅ Checkpoint created: ${checkpoint.id}`);
  console.log(`   Story: ${story || 'N/A'}`);
  console.log(`   Phase: ${phase}`);
  console.log(`   Files: ${checkpoint.files.length} modified`);
  
  return checkpoint;
}

// Load latest checkpoint
async function loadLatestCheckpoint(): Promise<Checkpoint | null> {
  const session = await getSession();
  if (!session.lastCheckpoint) {
    console.log('No checkpoints found');
    return null;
  }

  const filePath = path.join(CHECKPOINT_DIR, `${session.lastCheckpoint}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const checkpoint = CheckpointSchema.parse(JSON.parse(content));
    
    console.log(`📂 Loaded checkpoint: ${checkpoint.id}`);
    console.log(`   Time: ${checkpoint.timestamp}`);
    console.log(`   Story: ${checkpoint.story || 'N/A'}`);
    console.log(`   Phase: ${checkpoint.phase}`);
    if (checkpoint.notes) console.log(`   Notes: ${checkpoint.notes}`);
    if (checkpoint.files.length > 0) {
      console.log(`   Files:`);
      checkpoint.files.forEach(f => console.log(`     - ${f}`));
    }
    
    return checkpoint;
  } catch {
    console.log('Failed to load checkpoint');
    return null;
  }
}

// List all checkpoints
async function listCheckpoints(): Promise<Checkpoint[]> {
  await ensureDir();
  
  const files = await fs.readdir(CHECKPOINT_DIR);
  const checkpoints: Checkpoint[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await fs.readFile(path.join(CHECKPOINT_DIR, file), 'utf8');
      checkpoints.push(CheckpointSchema.parse(JSON.parse(content)));
    } catch {
      // Skip invalid checkpoints
    }
  }

  // Sort by timestamp descending
  checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  console.log(`\n📋 Checkpoints (${checkpoints.length} total):\n`);
  checkpoints.forEach((cp, i) => {
    const time = new Date(cp.timestamp).toLocaleTimeString();
    console.log(`${i + 1}. ${cp.id.slice(0, 8)}... | ${time} | ${cp.phase} | ${cp.story || 'No story'}`);
  });

  return checkpoints;
}

// Auto-save mode
async function autoSave(intervalSeconds: number = 300) {
  console.log(`🔄 Auto-save mode enabled (every ${intervalSeconds}s)`);
  console.log('Press Ctrl+C to stop\n');

  const interval = setInterval(async () => {
    try {
      await createCheckpoint(undefined, undefined, 'DEV', 'Auto-save');
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }, intervalSeconds * 1000);

  // Keep process alive
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n👋 Auto-save stopped');
    process.exit(0);
  });

  // Initial checkpoint
  await createCheckpoint(undefined, undefined, 'DEV', 'Auto-save started');
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'create':
    case 'save': {
      const storyIdx = args.indexOf('--story');
      const epicIdx = args.indexOf('--epic');
      const phaseIdx = args.indexOf('--phase');
      const notesIdx = args.indexOf('--notes');

      const story = storyIdx > -1 ? args[storyIdx + 1] : undefined;
      const epic = epicIdx > -1 ? args[epicIdx + 1] : undefined;
      const phase = (phaseIdx > -1 ? args[phaseIdx + 1] : 'DEV') as Checkpoint['phase'];
      const notes = notesIdx > -1 ? args[notesIdx + 1] : undefined;

      await createCheckpoint(story, epic, phase, notes);
      break;
    }

    case 'load':
    case 'restore': {
      await loadLatestCheckpoint();
      break;
    }

    case 'list':
    case 'ls': {
      await listCheckpoints();
      break;
    }

    case 'auto': {
      const intervalIdx = args.indexOf('--interval');
      const interval = intervalIdx > -1 ? parseInt(args[intervalIdx + 1]) : 300;
      await autoSave(interval);
      break;
    }

    default:
      console.log(`
📦 Standalone Checkpoint Tool - No Brain, No MCP, No Skills

Usage:
  bun run scripts/checkpoint.ts create [options]   Create new checkpoint
  bun run scripts/checkpoint.ts load                 Load latest checkpoint
  bun run scripts/checkpoint.ts list                 List all checkpoints
  bun run scripts/checkpoint.ts auto [options]       Auto-save mode

Options:
  --story <name>     Story/task name
  --epic <name>      Epic name
  --phase <phase>    Phase: DEV, CODE_REVIEW, CORRECT_COURSE, BLOOD_LOOP, RETROSPECTIVE, WAITING
  --notes <text>     Additional notes
  --interval <sec>   Auto-save interval (default: 300s)

Examples:
  bun run scripts/checkpoint.ts create --story "Fix login bug" --phase DEV
  bun run scripts/checkpoint.ts create --story "Refactor auth" --notes "Breaking change"
  bun run scripts/checkpoint.ts auto --interval 60
      `);
  }
}

main().catch(console.error);
