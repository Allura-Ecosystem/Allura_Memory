/**
 * PostgreSQL encrypted backup. The existing transport/archive format is retained.
 * Runtime use is separate from the explicitly approved disposable recovery test.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { link, mkdir, mkdtemp, open, rm, stat, unlink, type FileHandle } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { BackupResult, EncryptionConfig } from "./types"

const DOCKER_EXEC_TIMEOUT_MS = 120_000

export interface PostgresBackupOptions {
  container: string
  database: string
  user: string
  outputDir: string
  encryption: EncryptionConfig
}

/** One dump, private plaintext, exclusive publication. Does not back up global roles. */
export async function backupPostgres(options: PostgresBackupOptions): Promise<BackupResult> {
  const startTime = Date.now()
  // Capture scalar values before the first await; callers cannot retarget a running backup.
  const { container, database, user } = options
  const outputDir = resolve(options.outputDir)
  const key = options.encryption.key
  const childEnv = { ...process.env, ALLURA_BACKUP_PASSPHRASE: key }
  if (!key || key.length < 8) throw new Error("BACKUP_ENCRYPTION_KEY must be at least 8 characters")
  const failed = (path: string, error: string): BackupResult => ({
    success: false, path, size: 0, duration_ms: Date.now() - startTime, checksum: "", error,
  })
  // Preserve restore-compatible basenames and refuse libpq conninfo expansion.
  if (!database || /[/\\=\u0000\r\n\u2028\u2029]/.test(database) || !user || user.includes("\u0000") ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) {
    return failed("", "PostgreSQL backup target or artifact name is invalid")
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const encPath = join(outputDir, "postgres-" + database + "-" + timestamp + ".sql.gz.enc")
  const sidecar = encPath + ".sha256"
  const handles: FileHandle[] = []
  let scratch: string | undefined
  let archiveOwned = false
  let sidecarOwned = false
  let stage = "output preparation"
  let error: string | undefined
  let checksum = ""
  let size = 0
  try {
    await mkdir(outputDir, { recursive: true, mode: 0o700 })
    stage = "Docker availability"
    execFileSync("docker", ["info"], { timeout: 5000, stdio: ["ignore", "ignore", "pipe"] })
    stage = "container validation"
    const running = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
      encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"],
    })
    if (!running.split(/\r?\n/).includes(container)) throw new Error("container absent")
    stage = "private temporary file creation"
    // Same filesystem permits no-overwrite hard-link publication after verification.
    scratch = await mkdtemp(join(outputDir, ".allura-pg-backup-"))
    const sqlPath = join(scratch, "backup.sql")
    const gzipPath = join(scratch, "backup.sql.gz")
    const encryptedPath = join(scratch, "backup.sql.gz.enc")
    const sql = await open(sqlPath, "wx", 0o600); handles.push(sql)
    stage = "database dump"
    execFileSync("docker", ["exec", container, "pg_dump", "-U", user, "--dbname", database], {
      timeout: DOCKER_EXEC_TIMEOUT_MS, stdio: ["ignore", sql.fd, "pipe"],
    })
    stage = "compression"
    const gzip = await open(gzipPath, "wx", 0o600); handles.push(gzip)
    execFileSync("gzip", ["-c", "--", sqlPath], {
      timeout: DOCKER_EXEC_TIMEOUT_MS, stdio: ["ignore", gzip.fd, "pipe"],
    })
    stage = "encryption"
    const encrypted = await open(encryptedPath, "wx", 0o600); handles.push(encrypted)
    execFileSync("openssl", ["enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "100000",
      "-in", gzipPath, "-pass", "env:ALLURA_BACKUP_PASSPHRASE"], {
      env: childEnv, timeout: DOCKER_EXEC_TIMEOUT_MS, stdio: ["ignore", encrypted.fd, "pipe"],
    })
    stage = "ciphertext checksum"
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(encryptedPath)) hash.update(chunk)
    checksum = hash.digest("hex")
    size = (await stat(encryptedPath)).size
    stage = "exclusive archive publication"
    await link(encryptedPath, encPath); archiveOwned = true
    stage = "exclusive checksum publication"
    const digest = await open(sidecar, "wx", 0o600); handles.push(digest); sidecarOwned = true
    await digest.writeFile(checksum)
  } catch {
    // Child diagnostics may contain SQL, data, paths or keys. Never forward them.
    error = "PostgreSQL backup failed during " + stage
  } finally {
    for (const handle of handles) {
      try { await handle.close() }
      catch { error = "PostgreSQL backup temporary file cleanup failed" }
    }
    if (scratch) {
      try { await rm(scratch, { recursive: true, force: true }) }
      catch { error = "PostgreSQL backup temporary plaintext cleanup failed" }
    }
    if (error) {
      // Only names successfully created by this invocation are eligible for removal.
      for (const path of [...(sidecarOwned ? [sidecar] : []), ...(archiveOwned ? [encPath] : [])]) {
        try { await unlink(path) }
        catch { error = "PostgreSQL backup owned artifact cleanup failed" }
      }
    }
  }
  if (error) {
    console.error(error)
    return failed(encPath, error)
  }
  console.log("PostgreSQL backup complete")
  return { success: true, path: encPath, size, duration_ms: Date.now() - startTime, checksum }
}
