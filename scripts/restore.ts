/**
 * Restore CLI Script
 *
 * Usage:
 *   bun run scripts/restore.ts --dry-run --date 20260429
 *   bun run scripts/restore.ts --date 20260429 --type postgres
 *   bun run scripts/restore.ts --date 20260429 --type postgres --type config
 *   bun run scripts/restore.ts --date 20260429 --force
 *
 * FR-4: Restore with dry-run mode
 * FR-9: Selective restore by type
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { runRestore, validateRestore } from "../src/lib/backup"
import type { BackupType, RestoreOptions } from "../src/lib/backup"

// Load environment variables
config({ path: resolve(__dirname, "../.env.local") })
config({ path: resolve(__dirname, "../.env") })

// ── Parse Arguments ──────────────────────────────────────────────────────────

function parseArgs(): RestoreOptions & { help: boolean } {
  const args = process.argv.slice(2)
  const options: RestoreOptions = {
    dryRun: false,
  }
  const types: BackupType[] = []
  let help = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--help" || arg === "-h") {
      help = true
    } else if (arg === "--dry-run" || arg === "-n") {
      options.dryRun = true
    } else if (arg === "--date" || arg === "-d") {
      options.date = args[++i]
    } else if (arg === "--type" || arg === "-t") {
      const type = args[++i] as BackupType
      types.push(type)
    } else if (arg === "--force" || arg === "-f") {
      options.force = true
    } else if (arg === "--backup-dir") {
      options.backupDir = args[++i]
    }
  }

  if (types.length > 0) {
    options.types = types
  }

  return { ...options, help }
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Restore CLI — Allura Memory System

Usage:
  bun run scripts/restore.ts [options]

Options:
  --date, -d <YYYYMMDD>  Required: Backup date to restore
  --type, -t <type>      Backup type to restore (postgres|config|workspace|skills)
                          Can be specified multiple times. Default: all in manifest
  --dry-run, -n          Validate without modifying state
  --force, -f            Skip validation and proceed
  --backup-dir <path>   Custom backup directory (default: ./backups)
  --help, -h             Show this help

Examples:
  bun run scripts/restore.ts --dry-run --date 20260429
  bun run scripts/restore.ts --date 20260429 --type postgres
  bun run scripts/restore.ts --date 20260429 --type postgres --type config

Environment:
  BACKUP_ENCRYPTION_KEY  Required: AES-256 encryption key (must match backup)
  POSTGRES_CONTAINER     Optional: Docker container name (default: knowledge-postgres)
  POSTGRES_DB            Optional: PostgreSQL database name (default: memory)
  POSTGRES_USER          Optional: PostgreSQL user (default: ronin4life)

`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { help, ...options } = parseArgs()

  if (help) {
    printHelp()
    process.exit(0)
  }

  if (!options.date) {
    console.error("ERROR: --date is required (format: YYYYMMDD)")
    console.error("Use --dry-run first to validate without modifying state")
    process.exit(1)
  }

  console.log("=== Allura Memory Restore ===")
  console.log(`Date: ${options.date}`)
  console.log(`Mode: ${options.dryRun ? "DRY RUN (no changes)" : "LIVE"}`)
  console.log(`Types: ${options.types?.join(", ") || "all in manifest"}`)
  console.log()

  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    console.error("ERROR: BACKUP_ENCRYPTION_KEY environment variable is required")
    console.error("Set it in .env or .env.local")
    process.exit(1)
  }

  // Always run validation first (unless --force)
  if (!options.force) {
    console.log("Running preflight validation...")
    const validation = await validateRestore(options)

    console.log("\n=== Validation Results ===")
    for (const check of validation.checks) {
      const icon = check.passed ? "✓" : "✗"
      console.log(`${icon} ${check.name}: ${check.message}`)
    }

    if (!validation.valid) {
      console.error("\n=== Validation FAILED ===")
      console.error("Errors:")
      for (const error of validation.errors) {
        console.error(`  - ${error}`)
      }
      console.error("\nUse --force to skip validation (NOT RECOMMENDED)")
      process.exit(1)
    }

    console.log("\n=== Validation PASSED ===")
    console.log(`Disk space: ${(validation.diskSpaceAvailable / 1024 / 1024 / 1024).toFixed(2)} GB available`)
    console.log(`Disk needed: ${(validation.diskSpaceNeeded / 1024 / 1024 / 1024).toFixed(2)} GB estimated`)

    if (options.dryRun) {
      console.log("\n=== DRY RUN COMPLETE ===")
      console.log("No changes were made. Remove --dry-run to execute restore.")
      process.exit(0)
    }

    console.log("\nProceeding with restore...")
  } else {
    console.warn("WARNING: --force flag set. Skipping validation!")
  }

  // Run restore
  try {
    const result = await runRestore(options)

    if (result.success) {
      console.log(`\n=== Restore SUCCESS ===`)
      console.log(`Restored: ${result.restored.join(", ")}`)
      process.exit(0)
    } else {
      console.error(`\n=== Restore FAILED ===`)
      console.error("Errors:")
      for (const error of result.errors) {
        console.error(`  - ${error}`)
      }
      process.exit(1)
    }
  } catch (error) {
    console.error("Restore failed:", error)
    process.exit(1)
  }
}

main()
