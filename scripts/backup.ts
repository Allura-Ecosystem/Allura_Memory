/**
 * Backup CLI Script
 *
 * Usage:
 *   bun run scripts/backup.ts --type postgres
 *   bun run scripts/backup.ts --type config
 *   bun run scripts/backup.ts --type workspace
 *   bun run scripts/backup.ts --type skills
 *   bun run scripts/backup.ts --type full
 *
 * FR-3: Automated backups with encryption
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { ALL_BACKUP_TYPES, runBackup } from "../src/lib/backup"
import type { BackupType } from "../src/lib/backup"

// Load environment variables
config({ path: resolve(__dirname, "../.env.local") })
config({ path: resolve(__dirname, "../.env") })

// ── Parse Arguments ──────────────────────────────────────────────────────────

function parseArgs(): { types: BackupType[]; help: boolean } {
  const args = process.argv.slice(2)
  const types: BackupType[] = []
  let help = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--help" || arg === "-h") {
      help = true
    } else if (arg === "--type" || arg === "-t") {
      const type = args[++i] as BackupType
      if (ALL_BACKUP_TYPES.includes(type) || type === "full") {
        types.push(type)
      } else {
        console.error(`Unknown backup type: ${type}`)
        console.error(`Valid types: ${ALL_BACKUP_TYPES.join(", ")}, full`)
        process.exit(1)
      }
    }
  }

  if (types.length === 0) {
    types.push("full")
  }

  return { types, help }
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Backup CLI — Allura Memory System

Usage:
  bun run scripts/backup.ts [options]

Options:
  --type, -t <type>  Backup type (postgres|config|workspace|skills|full)
                     Can be specified multiple times. Default: full
  --help, -h         Show this help

Examples:
  bun run scripts/backup.ts --type postgres
  bun run scripts/backup.ts --type postgres --type config
  bun run scripts/backup.ts --type full

Environment:
  BACKUP_ENCRYPTION_KEY  Required: AES-256 encryption key (min 8 chars)
  BACKUP_DIR             Optional: Backup directory (default: ./backups)
  POSTGRES_CONTAINER     Optional: Docker container name (default: knowledge-postgres)
  POSTGRES_DB            Optional: PostgreSQL database name (default: memory)
  POSTGRES_USER          Optional: PostgreSQL user (default: ronin4life)

`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { types, help } = parseArgs()

  if (help) {
    printHelp()
    process.exit(0)
  }

  console.log("=== Allura Memory Backup ===")
  console.log(`Types: ${types.join(", ")}`)
  console.log(`Encryption: ${process.env.BACKUP_ENCRYPTION_KEY ? "enabled" : "DISABLED"}`)
  console.log()

  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    console.error("ERROR: BACKUP_ENCRYPTION_KEY environment variable is required")
    console.error("Set it in .env or .env.local")
    process.exit(1)
  }

  try {
    const results = await runBackup(types)

    let successCount = 0
    let failureCount = 0

    for (const [type, result] of results) {
      if (result.success) {
        successCount++
        console.log(`✓ ${type}: ${(result.size / 1024 / 1024).toFixed(2)} MB`)
      } else {
        failureCount++
        console.error(`✗ ${type}: ${result.error}`)
      }
    }

    console.log(`\n=== Results: ${successCount} success, ${failureCount} failures ===`)
    process.exit(failureCount > 0 ? 1 : 0)
  } catch (error) {
    console.error("Backup failed:", error)
    process.exit(1)
  }
}

main()
