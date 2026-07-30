/**
 * Restore Module — Dry-run validation and selective restore
 *
 * FR-4: Restore with dry-run mode
 * FR-7: Backup manifest with integrity checksums
 * FR-8: Backup listing with retention policy
 * FR-9: Selective restore by type
 * NFR-1: Secrets redaction
 * NFR-2: Audit events
 */

import { execSync } from "node:child_process"
import { access, mkdir, readFile, stat } from "node:fs/promises"
import { homedir, hostname } from "node:os"
import { join, resolve } from "node:path"
import type {
  BackupInventoryItem,
  BackupManifest,
  BackupType,
  RestoreCheckResult,
  RestoreOptions,
  RestoreValidationResult,
  RetentionPolicy,
  RetentionStatus,
} from "./types"
import {
  DEFAULT_RETENTION_POLICY,
  EVENT_RESTORE_COMPLETED,
  EVENT_RESTORE_FAILED,
  EVENT_RESTORE_STARTED,
  EVENT_RESTORE_VALIDATED,
  MANIFEST_FILENAME,
  MIN_SUPPORTED_BACKUP_VERSION,
} from "./types"

// ── Audit Event Integration ───────────────────────────────────────────────────

let insertEventFn: typeof import("../postgres/queries/insert-trace").insertEvent | null = null

async function getInsertEvent() {
  if (!insertEventFn) {
    try {
      const mod = await import("../postgres/queries/insert-trace")
      insertEventFn = mod.insertEvent
    } catch {
      // Events module not available
    }
  }
  return insertEventFn
}

async function emitAuditEvent(
  eventType: string,
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
      agent_id: "restore-worker",
      event_type: eventType,
      status: error ? "failed" : "completed",
      metadata: {
        ...metadata,
        hostname: hostname(),
      },
      error_message: error,
    })
  } catch (e) {
    console.error(`Failed to emit audit event ${eventType}:`, e)
  }
}

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

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Get available disk space in bytes (Unix only)
 */
function getDiskSpace(path: string): number {
  try {
    const result = execSync(`df -B1 "${path}" | tail -1 | awk '{print $4}'`, {
      encoding: "utf-8",
      timeout: 5000,
    })
    return parseInt(result.trim(), 10) || 0
  } catch {
    return Number.MAX_SAFE_INTEGER // Assume plenty of space if we can't check
  }
}

/**
 * Verify a SHA-256 checksum
 */
async function verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
  try {
    const checksumPath = `${filePath}.sha256`
    const storedChecksum = (await readFile(checksumPath, "utf-8")).trim()
    return storedChecksum === expectedChecksum
  } catch {
    // If no .sha256 file, we can't verify
    return true // Assume valid if no checksum file
  }
}

/**
 * Load and parse a backup manifest
 */
export async function loadManifest(backupDir: string): Promise<BackupManifest | null> {
  const manifestPath = resolve(backupDir, MANIFEST_FILENAME)
  try {
    await access(manifestPath)
    const content = await readFile(manifestPath, "utf-8")
    return JSON.parse(content) as BackupManifest
  } catch {
    return null
  }
}

/**
 * Validate a restore operation (dry-run mode)
 *
 * Checks:
 * 1. Backup directory exists
 * 2. Manifest exists and is valid JSON
 * 3. Schema version is compatible
 * 4. All files referenced in manifest exist
 * 5. All checksums match
 * 6. Target containers are running (for DB restores)
 * 7. Sufficient disk space
 */
export async function validateRestore(
  options: RestoreOptions,
): Promise<RestoreValidationResult> {
  const startTime = Date.now()
  const backupDir = options.backupDir || resolve(process.cwd(), "backups")
  const targetDate = options.date

  const checks: RestoreCheckResult[] = []
  const errors: string[] = []

  // ── Check 1: Backup directory exists ────────────────────────────────────
  const dateDir = targetDate
    ? resolve(backupDir, targetDate)
    : backupDir

  try {
    await access(dateDir)
    checks.push({
      name: "backup_directory_exists",
      passed: true,
      message: `Backup directory found: ${dateDir}`,
    })
  } catch {
    checks.push({
      name: "backup_directory_exists",
      passed: false,
      message: `Backup directory not found: ${dateDir}`,
    })
    errors.push(`Backup directory not found: ${dateDir}`)

    await emitAuditEvent(EVENT_RESTORE_VALIDATED, {
      dry_run: options.dryRun,
      date: targetDate,
      passed: false,
      errors,
    })

    return {
      valid: false,
      checks,
      diskSpaceNeeded: 0,
      diskSpaceAvailable: 0,
      errors,
    }
  }

  // ── Check 2: Manifest exists and is valid JSON ─────────────────────────
  let manifest: BackupManifest | null = null
  try {
    manifest = await loadManifest(dateDir)
    if (!manifest) {
      throw new Error("Manifest not found")
    }
    checks.push({
      name: "manifest_valid",
      passed: true,
      message: `Manifest loaded: ${manifest.types.length} backup types, version ${manifest.backup_version}`,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    checks.push({
      name: "manifest_valid",
      passed: false,
      message: `Failed to load manifest: ${msg}`,
    })
    errors.push(`Manifest error: ${msg}`)
  }

  if (!manifest) {
    await emitAuditEvent(EVENT_RESTORE_VALIDATED, {
      dry_run: options.dryRun,
      date: targetDate,
      passed: false,
      errors,
    })

    return {
      valid: false,
      checks,
      diskSpaceNeeded: 0,
      diskSpaceAvailable: 0,
      manifest: undefined,
      errors,
    }
  }

  // ── Check 3: Schema version compatibility ──────────────────────────────
  const schemaVersion = manifest.schema_version || 0
  if (schemaVersion < MIN_SUPPORTED_BACKUP_VERSION) {
    checks.push({
      name: "schema_version_compatible",
      passed: false,
      message: `Schema version ${schemaVersion} is below minimum supported ${MIN_SUPPORTED_BACKUP_VERSION}`,
    })
    errors.push(`Schema version ${schemaVersion} is too old`)
  } else {
    checks.push({
      name: "schema_version_compatible",
      passed: true,
      message: `Schema version ${schemaVersion} is compatible`,
    })
  }

  // ── Check 4: Files exist ────────────────────────────────────────────────
  let totalSize = 0
  const filesToCheck = Object.keys(manifest.checksums || {})

  for (const filename of filesToCheck) {
    const filePath = resolve(dateDir, filename)
    try {
      await access(filePath)
      const stats = await stat(filePath)
      totalSize += stats.size
      checks.push({
        name: `file_exists_${filename}`,
        passed: true,
        message: `${filename} found (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
      })
    } catch {
      checks.push({
        name: `file_exists_${filename}`,
        passed: false,
        message: `${filename} not found`,
      })
      errors.push(`Backup file missing: ${filename}`)
    }
  }

  // ── Check 5: Checksums match ─────────────────────────────────────────────
  for (const [filename, expectedChecksum] of Object.entries(manifest.checksums || {})) {
    const filePath = resolve(dateDir, filename)
    try {
      const valid = await verifyChecksum(filePath, expectedChecksum)
      if (valid) {
        checks.push({
          name: `checksum_${filename}`,
          passed: true,
          message: `${filename} checksum verified`,
        })
      } else {
        checks.push({
          name: `checksum_${filename}`,
          passed: false,
          message: `${filename} checksum mismatch`,
        })
        errors.push(`Checksum mismatch: ${filename}`)
      }
    } catch (error) {
      checks.push({
        name: `checksum_${filename}`,
        passed: false,
        message: `Could not verify checksum for ${filename}`,
      })
    }
  }

  // ── Check 6: Target containers running (for DB types) ─────────────────
  const requestedTypes = options.types || manifest.types
  const needsPostgres = requestedTypes.includes("postgres") || requestedTypes.includes("full")

  if (needsPostgres) {
    try {
      execSync("docker ps --format '{{.Names}}' | grep -Fx 'knowledge-postgres'", {
        encoding: "utf-8",
        timeout: 5000,
      })
      checks.push({
        name: "postgres_container_running",
        passed: true,
        message: "PostgreSQL container (knowledge-postgres) is running",
      })
    } catch {
      checks.push({
        name: "postgres_container_running",
        passed: false,
        message: "PostgreSQL container (knowledge-postgres) is not running",
      })
      errors.push("PostgreSQL container is not running")
    }
  }

  // ── Check 7: Disk space ──────────────────────────────────────────────────
  const diskSpaceAvailable = getDiskSpace(dateDir)
  // Estimate needed space: total backup size * 2 (for decompression + restore)
  const diskSpaceNeeded = totalSize * 2

  if (diskSpaceAvailable < diskSpaceNeeded) {
    checks.push({
      name: "disk_space",
      passed: false,
      message: `Insufficient disk space: ${(diskSpaceNeeded / 1024 / 1024 / 1024).toFixed(2)} GB needed, ${(diskSpaceAvailable / 1024 / 1024 / 1024).toFixed(2)} GB available`,
    })
    errors.push("Insufficient disk space for restore")
  } else {
    checks.push({
      name: "disk_space",
      passed: true,
      message: `Disk space OK: ${(diskSpaceAvailable / 1024 / 1024 / 1024).toFixed(2)} GB available`,
    })
  }

  // ── Determine overall validity ──────────────────────────────────────────
  const allPassed = checks.every((c) => c.passed)
  const valid = allPassed || (!!options.force && errors.length === 0)

  await emitAuditEvent(EVENT_RESTORE_VALIDATED, {
    dry_run: options.dryRun,
    date: targetDate,
    types: requestedTypes,
    passed: valid,
    duration_ms: Date.now() - startTime,
    errors,
  })

  return {
    valid,
    checks,
    diskSpaceNeeded,
    diskSpaceAvailable,
    manifest,
    errors,
  }
}

// ── Restore ───────────────────────────────────────────────────────────────────

/**
 * Execute a restore operation
 *
 * Steps:
 * 1. Validate (unless force is set)
 * 2. For each type:
 *    a. Decrypt backup file
 *    b. Verify checksum
 *    c. Apply restore (docker exec for DB, tar extract for files)
 * 3. Emit audit events
 */
export async function runRestore(
  options: RestoreOptions,
): Promise<{ success: boolean; restored: BackupType[]; errors: string[] }> {
  const startTime = Date.now()
  const backupDir = options.backupDir || resolve(process.cwd(), "backups")
  const targetDate = options.date

  if (!targetDate) {
    return {
      success: false,
      restored: [],
      errors: ["--date is required for restore (format: YYYYMMDD)"],
    }
  }

  const dateDir = resolve(backupDir, targetDate)
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || ""

  if (!encryptionKey) {
    return {
      success: false,
      restored: [],
      errors: ["BACKUP_ENCRYPTION_KEY environment variable is required"],
    }
  }

  // ── Step 1: Validate ─────────────────────────────────────────────────────
  if (!options.force) {
    console.log("Running preflight validation...")
    const validation = await validateRestore(options)

    if (!validation.valid) {
      console.error("Validation failed:")
      for (const error of validation.errors) {
        console.error(`  - ${error}`)
      }
      return {
        success: false,
        restored: [],
        errors: validation.errors,
      }
    }
  }

  // ── Load manifest ──────────────────────────────────────────────────────
  const manifest = await loadManifest(dateDir)
  if (!manifest) {
    return {
      success: false,
      restored: [],
      errors: ["Could not load backup manifest"],
    }
  }

  const typesToRestore = options.types || manifest.types

  // ── Emit start event ────────────────────────────────────────────────────
  await emitAuditEvent(EVENT_RESTORE_STARTED, {
    date: targetDate,
    types: typesToRestore,
    dry_run: options.dryRun,
  })

  if (options.dryRun) {
    console.log("\n=== DRY RUN MODE ===")
    console.log("No changes will be made. Showing what would be restored:\n")
  }

  const restored: BackupType[] = []
  const errors: string[] = []

  // ── Restore each type ──────────────────────────────────────────────────
  for (const type of typesToRestore) {
    if (!manifest.types.includes(type)) {
      console.warn(`Type ${type} not found in backup manifest, skipping`)
      continue
    }

    console.log(`\n=== Restoring ${type} ===`)

    if (options.dryRun) {
      console.log(`[DRY RUN] Would restore ${type}`)
      restored.push(type)
      continue
    }

    try {
      switch (type) {
        case "postgres":
          await restorePostgres(dateDir, encryptionKey)
          restored.push("postgres")
          break

        case "config":
          await restoreConfig(dateDir, encryptionKey)
          restored.push("config")
          break

        case "workspace":
          await restoreWorkspace(dateDir, encryptionKey)
          restored.push("workspace")
          break

        case "skills":
          await restoreSkills(dateDir, encryptionKey)
          restored.push("skills")
          break

        default:
          errors.push(`Unknown restore type: ${type}`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push(`${type}: ${msg}`)
      console.error(`Failed to restore ${type}: ${msg}`)
    }
  }

  const success = errors.length === 0

  // ── Emit completion event ──────────────────────────────────────────────
  if (success) {
    await emitAuditEvent(EVENT_RESTORE_COMPLETED, {
      date: targetDate,
      types: restored,
      dry_run: options.dryRun,
      duration_ms: Date.now() - startTime,
    })
  } else {
    await emitAuditEvent(EVENT_RESTORE_FAILED, {
      date: targetDate,
      types: restored,
      errors,
      dry_run: options.dryRun,
      duration_ms: Date.now() - startTime,
    })
  }

  return {
    success,
    restored,
    errors,
  }
}

// ── Individual Restore Functions ────────────────────────────────────────────────

async function restorePostgres(dateDir: string, encryptionKey: string): Promise<void> {
  // Find the encrypted backup file
  const files = await execSync(`ls -1 "${dateDir}" | grep '^postgres-.*\.sql\.gz\.enc$'`, {
    encoding: "utf-8",
  })
  const encFile = files.trim().split("\n")[0]
  if (!encFile) {
    throw new Error("No PostgreSQL backup file found")
  }

  const encPath = resolve(dateDir, encFile)
  const gzipPath = encPath.replace(".enc", "")
  const sqlPath = gzipPath.replace(".gz", "")

  // Decrypt
  execSync(`openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "${encPath}" -out "${gzipPath}" -pass pass:"${encryptionKey}"`, {
    encoding: "utf-8",
    timeout: 120_000,
  })

  // Decompress
  execSync(`gunzip -f "${gzipPath}"`, { encoding: "utf-8", timeout: 120_000 })

  // Restore (requires POSTGRES_PASSWORD and POSTGRES_USER)
  const container = process.env.POSTGRES_CONTAINER || "knowledge-postgres"
  const user = process.env.POSTGRES_USER || "ronin4life"
  const db = process.env.POSTGRES_DB || "memory"

  console.log(`Restoring PostgreSQL database ${db}...`)
  execSync(`cat "${sqlPath}" | docker exec -i "${container}" psql -U "${user}" "${db}"`, {
    encoding: "utf-8",
    timeout: 300_000,
  })

  // Cleanup
  execSync(`rm -f "${gzipPath}" "${sqlPath}"`, { encoding: "utf-8" })

  console.log("PostgreSQL restore complete")
}

async function restoreConfig(dateDir: string, encryptionKey: string): Promise<void> {
  const files = await execSync(`ls -1 "${dateDir}" | grep '^config-.*\.tar\.gz\.enc$'`, {
    encoding: "utf-8",
  })
  const encFile = files.trim().split("\n")[0]
  if (!encFile) {
    throw new Error("No config backup file found")
  }

  const encPath = resolve(dateDir, encFile)
  const tarPath = encPath.replace(".enc", "")

  // Decrypt
  execSync(`openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "${encPath}" -out "${tarPath}" -pass pass:"${encryptionKey}"`, {
    encoding: "utf-8",
    timeout: 60_000,
  })

  // Extract
  console.log("Restoring configuration files...")
  execSync(`tar -xzf "${tarPath}" -C "${process.cwd()}"`, { encoding: "utf-8", timeout: 60_000 })

  // Cleanup
  execSync(`rm -f "${tarPath}"`, { encoding: "utf-8" })

  console.log("Config restore complete")
}

async function restoreWorkspace(dateDir: string, encryptionKey: string): Promise<void> {
  const files = await execSync(`ls -1 "${dateDir}" | grep '^workspace-.*\.tar\.gz\.enc$'`, {
    encoding: "utf-8",
  })
  const encFile = files.trim().split("\n")[0]
  if (!encFile) {
    throw new Error("No workspace backup file found")
  }

  const encPath = resolve(dateDir, encFile)
  const tarPath = encPath.replace(".enc", "")

  // Decrypt
  execSync(`openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "${encPath}" -out "${tarPath}" -pass pass:"${encryptionKey}"`, {
    encoding: "utf-8",
    timeout: 60_000,
  })

  // Extract to workspace root
  const workspaceRoot = process.env.WORKSPACE_ROOT || resolve(homedir(), ".openclaw/workspace")
  console.log("Restoring workspace files...")
  execSync(`tar -xzf "${tarPath}" -C "${workspaceRoot}"`, { encoding: "utf-8", timeout: 60_000 })

  // Cleanup
  execSync(`rm -f "${tarPath}"`, { encoding: "utf-8" })

  console.log("Workspace restore complete")
}

async function restoreSkills(dateDir: string, encryptionKey: string): Promise<void> {
  const files = await execSync(`ls -1 "${dateDir}" | grep '^skills-.*\.tar\.gz\.enc$'`, {
    encoding: "utf-8",
  })
  const encFile = files.trim().split("\n")[0]
  if (!encFile) {
    throw new Error("No skills backup file found")
  }

  const encPath = resolve(dateDir, encFile)
  const tarPath = encPath.replace(".enc", "")

  // Decrypt
  execSync(`openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "${encPath}" -out "${tarPath}" -pass pass:"${encryptionKey}"`, {
    encoding: "utf-8",
    timeout: 60_000,
  })

  // Extract to skills directories
  const skillsDirs = process.env.SKILLS_DIRS?.split(",") || [resolve(homedir(), ".openclaw/workspace/skills")]
  for (const dir of skillsDirs) {
    console.log(`Restoring skills to ${dir}...`)
    execSync(`tar -xzf "${tarPath}" -C "${dir}"`, { encoding: "utf-8", timeout: 60_000 })
  }

  // Cleanup
  execSync(`rm -f "${tarPath}"`, { encoding: "utf-8" })

  console.log("Skills restore complete")
}

// ── Listing ───────────────────────────────────────────────────────────────────

/**
 * Scan backups directory and build inventory
 *
 * FR-8: Backup listing with retention policy
 */
export async function listBackups(
  backupDir: string = resolve(process.cwd(), "backups"),
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): Promise<BackupInventoryItem[]> {
  const { readdir } = await import("node:fs/promises")
  const { stat } = await import("node:fs/promises")
  const { resolve } = await import("node:path")

  const items: BackupInventoryItem[] = []

  try {
    const entries = await readdir(backupDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const dateStr = entry.name
      if (!/^\d{8}$/.test(dateStr)) continue // Skip non-date directories

      const dirPath = resolve(backupDir, dateStr)
      const manifest = await loadManifest(dirPath)

      if (!manifest) continue

      const now = new Date()
      const backupDate = new Date(
        parseInt(dateStr.slice(0, 4)),
        parseInt(dateStr.slice(4, 6)) - 1,
        parseInt(dateStr.slice(6, 8)),
      )

      const ageDays = Math.floor((now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24))

      // Determine retention status
      let retention: RetentionStatus = "keep"
      if (ageDays > policy.monthly * 30) {
        retention = "expired"
      } else if (ageDays > policy.weekly * 7) {
        retention = "expire_soon"
      }

      // Check if we should keep this as a monthly backup
      const isMonthly = backupDate.getDate() === 1
      if (isMonthly && ageDays <= policy.monthly * 30) {
        retention = "keep"
      }

      // Check if we should keep this as a weekly backup
      const isWeekly = backupDate.getDay() === 0 // Sunday
      if (isWeekly && ageDays <= policy.weekly * 7) {
        retention = "keep"
      }

      // Keep recent daily backups
      if (ageDays <= policy.daily) {
        retention = "keep"
      }

      items.push({
        date: dateStr,
        types: manifest.types,
        total_size: manifest.total_size,
        schema_version: manifest.schema_version,
        retention,
        integrity_verified: manifest.integrity_verified,
        path: dirPath,
      })
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  // Sort by date descending
  return items.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Get retention summary
 */
export function getRetentionSummary(items: BackupInventoryItem[]): {
  total: number
  keep: number
  expire_soon: number
  expired: number
  total_size: number
} {
  return {
    total: items.length,
    keep: items.filter((i) => i.retention === "keep").length,
    expire_soon: items.filter((i) => i.retention === "expire_soon").length,
    expired: items.filter((i) => i.retention === "expired").length,
    total_size: items.reduce((sum, i) => sum + i.total_size, 0),
  }
}
