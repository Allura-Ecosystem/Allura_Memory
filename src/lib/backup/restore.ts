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

import { execFileSync, execSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { access, lstat, mkdir, mkdtemp, open, readFile, rm, stat } from "node:fs/promises"
import { homedir, hostname, tmpdir } from "node:os"
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
    const result = execFileSync("df", ["-P", "-B1", "--", path], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    })
    return parseInt(result.trim().split("\n").at(-1)!.trim().split(/\s+/)[3], 10) || 0
  } catch {
    return Number.MAX_SAFE_INTEGER // Assume plenty of space if we can't check
  }
}

function postgresTarget() {
  return {
    container: process.env.POSTGRES_CONTAINER || "knowledge-postgres",
    user: process.env.POSTGRES_USER || "ronin4life",
    database: process.env.POSTGRES_DB || "memory",
    scratchParent: tmpdir(),
  }
}

function assertPlainPostgresTarget(target: ReturnType<typeof postgresTarget>): void {
  // psql -d expands conninfo; this API accepts a database name, not a remote URL.
  if (!target.database || /[=\u0000]/.test(target.database) || /^postgres(?:ql)?:\/\//.test(target.database) ||
      !target.user || target.user.includes("\u0000") || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(target.container)) {
    throw new Error("PostgreSQL restore target is invalid")
  }
}

function manifestFilenames(manifest: BackupManifest): string[] {
  const filenames = Object.keys(manifest.checksums || {})
  // The backup writer records basenames, never paths. Force cannot select outside the archive.
  if (filenames.some(name => !name || name === "." || name === ".." || /[/\\\u0000]/.test(name))) {
    throw new Error("Backup manifest contains an unsafe artifact filename")
  }
  return filenames
}

async function postgresArchive(dateDir: string, manifest: BackupManifest): Promise<string> {
  if (!manifest.types.includes("postgres")) throw new Error("PostgreSQL type not found in backup manifest")
  const candidates = manifestFilenames(manifest).filter(name => /^postgres-.*\.sql\.gz\.enc$/.test(name))
  if (candidates.length !== 1) throw new Error("Backup manifest must identify exactly one PostgreSQL archive")
  const path = resolve(dateDir, candidates[0])
  try {
    if (!(await lstat(path)).isFile()) throw new Error("Not a regular file")
  } catch {
    throw new Error("PostgreSQL archive must be an existing regular file, not a symlink")
  }
  return path
}

/**
 * Verify archive bytes against the manifest's SHA-256 checksum.
 * Sidecars are optional compatibility metadata, never a substitute for hashing.
 */
async function verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
  if (typeof expectedChecksum !== "string" || !/^[a-f0-9]{64}$/.test(expectedChecksum)) {
    return false
  }

  try {
    // Stream large archives instead of buffering a database backup in memory.
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(filePath)) {
      hash.update(chunk)
    }
    if (hash.digest("hex") !== expectedChecksum) return false

    try {
      const storedChecksum = (await readFile(`${filePath}.sha256`, "utf-8")).trim()
      return storedChecksum === expectedChecksum
    } catch (error) {
      // Existing archives without sidecars are valid only after byte verification.
      return (error as NodeJS.ErrnoException).code === "ENOENT"
    }
  } catch {
    return false
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
  return validateRestoreForTarget(options, postgresTarget())
}

async function validateRestoreForTarget(
  options: RestoreOptions,
  target: ReturnType<typeof postgresTarget>,
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
    if (!Array.isArray(manifest.types)) throw new Error("Manifest backup types are invalid")
    manifestFilenames(manifest)
    const requested = options.types || manifest.types
    if (requested.includes("postgres")) await postgresArchive(dateDir, manifest)
    checks.push({
      name: "manifest_valid",
      passed: true,
      message: `Manifest loaded: ${manifest.types.length} backup types, version ${manifest.backup_version}`,
    })
  } catch (error) {
    manifest = null
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
      assertPlainPostgresTarget(target)
      const containers = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      })
      if (!containers.trim().split("\n").includes(target.container)) throw new Error("Target not running")
      checks.push({
        name: "postgres_container_running",
        passed: true,
        message: `PostgreSQL container (${target.container}) is running`,
      })
    } catch {
      checks.push({
        name: "postgres_container_running",
        passed: false,
        message: `PostgreSQL container (${target.container}) is not running`,
      })
      errors.push("PostgreSQL container is not running")
    }
  }

  // ── Check 7: Disk space ──────────────────────────────────────────────────
  // PostgreSQL plaintext is written to the private temp filesystem, not beside the archive.
  const onlyPostgres = requestedTypes.length > 0 && requestedTypes.every(type => type === "postgres")
  const diskSpaceAvailable = onlyPostgres
    ? getDiskSpace(target.scratchParent)
    : Math.min(getDiskSpace(dateDir), needsPostgres ? getDiskSpace(target.scratchParent) : Number.MAX_SAFE_INTEGER)
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
 *    b. Apply restore (docker exec for DB, tar extract for files)
 * Checksums are verified by preflight, unless explicitly bypassed with force.
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
  const target = postgresTarget()
  let manifest: BackupManifest | null = null

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
    const validation = await validateRestoreForTarget(options, target)

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
    manifest = validation.manifest || null
  }

  // ── Load manifest ──────────────────────────────────────────────────────
  manifest ??= await loadManifest(dateDir)
  if (!manifest) {
    return {
      success: false,
      restored: [],
      errors: ["Could not load backup manifest"],
    }
  }

  const typesToRestore = options.types || manifest.types
  let postgresPath: string | undefined
  try {
    if (!Array.isArray(manifest.types) || !Array.isArray(typesToRestore)) throw new Error("Manifest backup types are invalid")
    manifestFilenames(manifest)
    if (typesToRestore.includes("postgres")) {
      assertPlainPostgresTarget(target)
      postgresPath = await postgresArchive(dateDir, manifest)
    }
  } catch (error) {
    return { success: false, restored: [], errors: [error instanceof Error ? error.message : "Invalid backup manifest"] }
  }

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
          await restorePostgres(postgresPath!, encryptionKey, target)
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

async function restorePostgres(
  encPath: string,
  encryptionKey: string,
  target: ReturnType<typeof postgresTarget>,
): Promise<void> {
  let scratch: string | undefined
  let stage = "temporary file setup"
  try {
    // mkdtemp creates a private directory. Never overwrite neighboring backup files.
    scratch = await mkdtemp(join(target.scratchParent, "allura-pg-restore-"))
    const gzipPath = join(scratch, "database.sql.gz")
    const sqlPath = join(scratch, "database.sql")
    const gzip = await open(gzipPath, "wx", 0o600)
    await gzip.close()
    stage = "decryption"
    execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "100000",
      "-in", encPath, "-out", gzipPath, "-pass", "env:ALLURA_RESTORE_PASSPHRASE"], {
      env: { ...process.env, ALLURA_RESTORE_PASSPHRASE: encryptionKey },
      stdio: ["ignore", "ignore", "pipe"], timeout: 120_000,
    })
    stage = "decompression"
    const output = await open(sqlPath, "wx", 0o600)
    try {
      execFileSync("gunzip", ["-c", gzipPath], { stdio: ["ignore", output.fd, "pipe"], timeout: 120_000 })
    } finally {
      await output.close()
    }
    stage = "database restore"
    const input = await open(sqlPath, "r")
    try {
      // Fail on SQL errors; this does not roll back statements already committed.
      execFileSync("docker", ["exec", "-i", target.container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
        "-U", target.user, "-d", target.database], {
        stdio: [input.fd, "ignore", "pipe"], timeout: 300_000,
      })
    } finally {
      await input.close()
    }
  } catch {
    // Child diagnostics can contain SQL data or credentials. Report only the failed stage.
    throw new Error(`PostgreSQL restore failed during ${stage}`)
  } finally {
    if (scratch) {
      try {
        await rm(scratch, { recursive: true, force: true })
      } catch {
        throw new Error("PostgreSQL restore temporary plaintext cleanup failed")
      }
    }
  }
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
