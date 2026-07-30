/**
 * Backup Worker — Orchestrates all backup types
 *
 * FR-3: Automated backups with encryption
 * FR-7: Backup manifest with integrity checksums
 * NFR-1: Secrets redaction
 * NFR-2: All operations emit audit events
 */

import { mkdir, writeFile } from "node:fs/promises"
import { homedir, hostname } from "node:os"
import { basename, join, resolve } from "node:path"
import { backupConfig } from "./config"
import { backupPostgres } from "./postgres"
import { backupSkills } from "./skills"
import type {
  BackupEventType,
  BackupManifest,
  BackupResult,
  BackupType,
  BackupWorkerConfig,
} from "./types"
import {
  ALL_BACKUP_TYPES,
  BACKUP_VERSION,
  DEFAULT_CONFIG_FILES,
  DEFAULT_WORKSPACE_DIRS,
  DEFAULT_WORKSPACE_FILES,
  EVENT_BACKUP_COMPLETED,
  EVENT_BACKUP_FAILED,
  EVENT_BACKUP_STARTED,
  MANIFEST_FILENAME,
} from "./types"
import { backupWorkspace } from "./workspace"

// ── Audit Event Integration ───────────────────────────────────────────────────

// Lazy import to avoid server-side import issues
let insertEventFn: typeof import("../postgres/queries/insert-trace").insertEvent | null = null

async function getInsertEvent() {
  if (!insertEventFn) {
    try {
      const mod = await import("../postgres/queries/insert-trace")
      insertEventFn = mod.insertEvent
    } catch {
      // Events module not available (e.g., browser or missing DB)
    }
  }
  return insertEventFn
}

/**
 * Emit an audit event for backup/restore operations
 * NFR-2: Every backup/restore emits an audit event
 */
async function emitAuditEvent(
  eventType: BackupEventType,
  metadata: Record<string, unknown>,
  error?: string,
): Promise<void> {
  const insertEvent = await getInsertEvent()
  if (!insertEvent) {
    console.log(`[AUDIT] ${eventType}: ${JSON.stringify(metadata)}`)
    return
  }

  try {
    await insertEvent({
      group_id: "allura-system",
      agent_id: "backup-worker",
      event_type: eventType,
      status: error ? "failed" : "completed",
      metadata: {
        ...metadata,
        hostname: hostname(),
        backup_version: BACKUP_VERSION,
      },
      error_message: error,
    })
  } catch (e) {
    console.error(`Failed to emit audit event ${eventType}:`, e)
  }
}

// ── Secret Redaction ──────────────────────────────────────────────────────────

function redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (
      key.toLowerCase().includes("password") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("key") ||
      key.toLowerCase().includes("token")
    ) {
      redacted[key] = "***REDACTED***"
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSecrets(value as Record<string, unknown>)
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

// ── Worker ────────────────────────────────────────────────────────────────────

/**
 * Get default worker configuration from environment
 */
export function getDefaultConfig(): BackupWorkerConfig {
  const env = process.env

  return {
    backupDir: env.BACKUP_DIR || resolve(process.cwd(), "backups"),
    encryptionKey: env.BACKUP_ENCRYPTION_KEY || "",
    containers: {
      postgres: env.POSTGRES_CONTAINER || "knowledge-postgres",
    },
    databases: {
      postgres: env.POSTGRES_DB || "memory",
    },
    postgresUser: env.POSTGRES_USER || "ronin4life",
    workspaceRoot: env.WORKSPACE_ROOT || resolve(homedir(), ".openclaw/workspace"),
    skillsDirs: env.SKILLS_DIRS?.split(",") || DEFAULT_WORKSPACE_DIRS,
    configFiles: env.CONFIG_FILES?.split(",") || DEFAULT_CONFIG_FILES,
  }
}

/**
 * Run a backup of the specified type(s)
 *
 * @param types - Backup types to run (default: all)
 * @param config - Worker configuration
 * @returns Map of type to result
 */
export async function runBackup(
  types: BackupType[] = ["full"],
  config: BackupWorkerConfig = getDefaultConfig(),
): Promise<Map<BackupType, BackupResult>> {
  const results = new Map<BackupType, BackupResult>()

  // Expand "full" to all types
  const expandedTypes: BackupType[] = []
  for (const type of types) {
    if (type === "full") {
      expandedTypes.push(...ALL_BACKUP_TYPES)
    } else {
      expandedTypes.push(type)
    }
  }

  // Validate encryption key
  if (!config.encryptionKey || config.encryptionKey.length < 8) {
    const error = "BACKUP_ENCRYPTION_KEY environment variable must be at least 8 characters"
    console.error(error)
    await emitAuditEvent(EVENT_BACKUP_FAILED, { types: expandedTypes }, error)
    throw new Error(error)
  }

  const encryption = {
    key: config.encryptionKey,
    cipher: "aes-256-cbc" as const,
    saltLength: 16,
  }

  // Create dated backup directory
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "")
  const backupDir = resolve(config.backupDir, dateStr)
  await mkdir(backupDir, { recursive: true })

  // ── Emit start event ─────────────────────────────────────────────────────
  await emitAuditEvent(EVENT_BACKUP_STARTED, {
    types: expandedTypes,
    backup_dir: backupDir,
  })

  const startTime = Date.now()
  const manifest: BackupManifest = {
    timestamp: date.toISOString(),
    date: dateStr,
    types: [],
    schema_version: 1,
    checksums: {},
    sizes: {},
    total_size: 0,
    duration_ms: 0,
    integrity_verified: true,
    hostname: hostname(),
    backup_version: BACKUP_VERSION,
  }

  let hasFailure = false

  // ── Run each backup type ─────────────────────────────────────────────────
  for (const type of expandedTypes) {
    console.log(`\n=== Backing up ${type} ===`)

    let result: BackupResult

    try {
      switch (type) {
        case "postgres":
          result = await backupPostgres({
            container: config.containers.postgres,
            database: config.databases.postgres,
            user: config.postgresUser,
            outputDir: backupDir,
            encryption,
          })
          break

        case "config":
          result = await backupConfig({
            projectRoot: process.cwd(),
            files: config.configFiles,
            outputDir: backupDir,
            encryption,
          })
          break

        case "workspace":
          result = await backupWorkspace({
            workspaceRoot: config.workspaceRoot,
            includeFiles: DEFAULT_WORKSPACE_FILES,
            includeDirs: DEFAULT_WORKSPACE_DIRS,
            outputDir: backupDir,
            encryption,
          })
          break

        case "skills":
          result = await backupSkills({
            skillsDirs: config.skillsDirs,
            outputDir: backupDir,
            encryption,
          })
          break

        default:
          throw new Error(`Unknown backup type: ${type}`)
      }

      results.set(type, result)

      if (result.success) {
        manifest.types.push(type)
        manifest.checksums[basename(result.path)] = result.checksum
        manifest.sizes[basename(result.path)] = result.size
        manifest.total_size += result.size
        console.log(`✓ ${type} backup successful`)
      } else {
        hasFailure = true
        manifest.integrity_verified = false
        console.error(`✗ ${type} backup failed: ${result.error}`)
      }
    } catch (error) {
      hasFailure = true
      manifest.integrity_verified = false
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`✗ ${type} backup failed: ${errorMsg}`)

      results.set(type, {
        success: false,
        path: "",
        size: 0,
        duration_ms: 0,
        checksum: "",
        error: errorMsg,
      })
    }
  }

  // ── Write manifest ───────────────────────────────────────────────────────
  manifest.duration_ms = Date.now() - startTime

  const manifestPath = resolve(backupDir, MANIFEST_FILENAME)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`\nManifest written: ${manifestPath}`)

  // ── Emit completion event ────────────────────────────────────────────────
  if (hasFailure) {
    await emitAuditEvent(EVENT_BACKUP_FAILED, {
      types: expandedTypes,
      backup_dir: backupDir,
      manifest: redactSecrets(manifest as unknown as Record<string, unknown>),
    })
  } else {
    await emitAuditEvent(EVENT_BACKUP_COMPLETED, {
      types: expandedTypes,
      backup_dir: backupDir,
      manifest: redactSecrets(manifest as unknown as Record<string, unknown>),
    })
  }

  return results
}
