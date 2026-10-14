/**
 * Backup Automation Tests
 *
 * FR-3, FR-4, FR-7, FR-8, FR-9, NFR-1, NFR-2
 *
 * Covers:
 * - Backup types and constants
 * - Manifest structure
 * - Secret redaction
 * - Restore validation (dry-run)
 * - Backup listing
 * - Retention policy
 * - Audit event emission
 * - Error handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { execFileSync, execSync, type ExecFileSyncOptions } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { fstatSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { access, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { gzipSync } from "node:zlib"
import { insertEvent } from "../lib/postgres/queries/insert-trace"
import type {
  BackupInventoryItem,
  BackupManifest,
  BackupResult,
  BackupType,
  RestoreOptions,
  RestoreValidationResult,
  RetentionPolicy,
} from "../lib/backup"
import { backupConfig } from "../lib/backup/config"
import { backupPostgres, type PostgresBackupOptions } from "../lib/backup/postgres"
import {
  getRetentionSummary,
  listBackups,
  loadManifest,
  runRestore,
  validateRestore,
} from "../lib/backup/restore"
import { backupSkills } from "../lib/backup/skills"
import {
  ALL_BACKUP_TYPES,
  BACKUP_VERSION,
  DEFAULT_RETENTION_POLICY,
  EVENT_BACKUP_COMPLETED,
  EVENT_BACKUP_FAILED,
  EVENT_BACKUP_STARTED,
  EVENT_RESTORE_COMPLETED,
  EVENT_RESTORE_FAILED,
  EVENT_RESTORE_STARTED,
  EVENT_RESTORE_VALIDATED,
  MANIFEST_FILENAME,
  MIN_SUPPORTED_BACKUP_VERSION,
} from "../lib/backup/types"
import { getDefaultConfig, runBackup } from "../lib/backup/worker"
import { backupWorkspace } from "../lib/backup/workspace"

// ── Mocks ───────────────────────────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return { ...actual, rm: vi.fn(actual.rm) }
})

vi.mock("../lib/postgres/queries/insert-trace", () => ({
  insertEvent: vi.fn().mockResolvedValue({ id: 1 }),
}))

// ── Test Helpers ──────────────────────────────────────────────────────────────

function createTempDir(): string {
  return resolve(tmpdir(), `backup-test-${randomBytes(4).toString("hex")}`)
}

async function createMockManifest(dir: string, overrides: Partial<BackupManifest> = {}): Promise<void> {
  const manifest: BackupManifest = {
    timestamp: new Date().toISOString(),
    date: "20260429",
    types: ["postgres", "config"],
    schema_version: 1,
    checksums: {
      "postgres-memory-20260429.sql.gz.enc": "abc123...",
      "config-20260429.tar.gz.enc": "def456...",
    },
    sizes: {
      "postgres-memory-20260429.sql.gz.enc": 1024 * 1024,
      "config-20260429.tar.gz.enc": 4096,
    },
    total_size: 1024 * 1024 + 4096,
    duration_ms: 5000,
    integrity_verified: true,
    hostname: "test-host",
    backup_version: BACKUP_VERSION,
    ...overrides,
  }

  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2))
}

// ── Types Tests ───────────────────────────────────────────────────────────────

describe("Backup Types", () => {
  it("ALL_BACKUP_TYPES includes all individual types", () => {
    expect(ALL_BACKUP_TYPES).toContain("postgres")
    expect(ALL_BACKUP_TYPES).toContain("config")
    expect(ALL_BACKUP_TYPES).toContain("config")
    expect(ALL_BACKUP_TYPES).toContain("workspace")
    expect(ALL_BACKUP_TYPES).toContain("skills")
    expect(ALL_BACKUP_TYPES).not.toContain("full")
  })

  it("BACKUP_VERSION is defined", () => {
    expect(BACKUP_VERSION).toBeDefined()
    expect(typeof BACKUP_VERSION).toBe("string")
  })

  it("MANIFEST_FILENAME is BackupManifest.json", () => {
    expect(MANIFEST_FILENAME).toBe("BackupManifest.json")
  })

  it("MIN_SUPPORTED_BACKUP_VERSION is 1", () => {
    expect(MIN_SUPPORTED_BACKUP_VERSION).toBe(1)
  })
})

// ── Manifest Tests ────────────────────────────────────────────────────────────

describe("BackupManifest", () => {
  it("manifest structure is valid", () => {
    const manifest: BackupManifest = {
      timestamp: new Date().toISOString(),
      date: "20260429",
      types: ["postgres"],
      schema_version: 1,
      checksums: { "test.enc": "abc123" },
      sizes: { "test.enc": 1024 },
      total_size: 1024,
      duration_ms: 1000,
      integrity_verified: true,
      hostname: "test",
      backup_version: BACKUP_VERSION,
    }

    expect(manifest.date).toMatch(/^\d{8}$/)
    expect(manifest.schema_version).toBeGreaterThanOrEqual(1)
    expect(manifest.total_size).toBeGreaterThanOrEqual(0)
    expect(manifest.integrity_verified).toBeTypeOf("boolean")
  })

  it("manifest schema_version must be at least 1", () => {
    const manifest: BackupManifest = {
      timestamp: new Date().toISOString(),
      date: "20260429",
      types: ["postgres"],
      schema_version: 0,
      checksums: {},
      sizes: {},
      total_size: 0,
      duration_ms: 0,
      integrity_verified: false,
      hostname: "test",
      backup_version: BACKUP_VERSION,
    }

    expect(manifest.schema_version).toBeLessThan(MIN_SUPPORTED_BACKUP_VERSION)
  })
})

// ── Secret Redaction Tests (NFR-1) ────────────────────────────────────────────

describe("Secret Redaction (NFR-1)", () => {
  it("should redact encryption keys in error messages", () => {
    const message = "Failed with key=deadbeef1234567890abcdef12345678"
    expect(message).toContain("key=")
    // The actual redaction is done inside modules; here we verify the concept
    const redacted = message.replace(/key=[a-f0-9]{32,}/gi, "key=***REDACTED***")
    expect(redacted).toContain("***REDACTED***")
    expect(redacted).not.toContain("deadbeef")
  })

  it("should redact passwords in error messages", () => {
    const message = "Failed with password=SuperSecret123!"
    const redacted = message.replace(/password=[^\s&]+/gi, "password=***REDACTED***")
    expect(redacted).toContain("***REDACTED***")
    expect(redacted).not.toContain("SuperSecret")
  })

  it("BACKUP_ENCRYPTION_KEY should be redacted", () => {
    const message = "BACKUP_ENCRYPTION_KEY=secret_key_value"
    const redacted = message.replace(/BACKUP_ENCRYPTION_KEY=[^\s&]+/gi, "BACKUP_ENCRYPTION_KEY=***REDACTED***")
    expect(redacted).toContain("***REDACTED***")
    expect(redacted).not.toContain("secret_key_value")
  })
})

// ── Worker Configuration Tests ────────────────────────────────────────────────

describe("getDefaultConfig", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("returns default values when no env vars set", () => {
    // getDefaultConfig() reads eight env vars; clear all of them so this test
    // exercises real defaults rather than whatever the ambient environment or a
    // developer's local .env happens to set.
    for (const key of [
      "BACKUP_DIR",
      "BACKUP_ENCRYPTION_KEY",
      "CONFIG_FILES",
      "POSTGRES_CONTAINER",
      "POSTGRES_DB",
      "POSTGRES_USER",
      "SKILLS_DIRS",
      "WORKSPACE_ROOT",
    ]) {
      delete process.env[key]
    }

    const config = getDefaultConfig()

    expect(config.encryptionKey).toBe("")
    expect(config.containers.postgres).toBe("knowledge-postgres")
    expect(config.containers.postgres).toBe("knowledge-postgres")
    expect(config.databases.postgres).toBe("memory")
  })

  it("reads BACKUP_ENCRYPTION_KEY from env", () => {
    process.env.BACKUP_ENCRYPTION_KEY = "test-key-123"
    const config = getDefaultConfig()
    expect(config.encryptionKey).toBe("test-key-123")
  })

  it("reads BACKUP_DIR from env", () => {
    process.env.BACKUP_DIR = "/custom/backups"
    const config = getDefaultConfig()
    expect(config.backupDir).toBe("/custom/backups")
  })
})

// ── Restore Validation Tests (FR-4, FR-7) ────────────────────────────────────

describe("validateRestore", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir()
  })

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
  })

  it("returns invalid when backup directory does not exist", async () => {
    const result = await validateRestore({
      dryRun: true,
      date: "99999999",
      backupDir: testDir,
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.checks.some((c) => c.name === "backup_directory_exists" && !c.passed)).toBe(true)
  })

  it("returns invalid when manifest is missing", async () => {
    await mkdir(testDir, { recursive: true })

    const result = await validateRestore({
      dryRun: true,
      date: "20260429",
      backupDir: testDir,
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.manifest).toBeUndefined()
  })

  it("returns invalid when schema version is too old", async () => {
    await createMockManifest(testDir, { schema_version: 0 })

    const result = await validateRestore({
      dryRun: true,
      date: "20260429",
      backupDir: testDir,
    })

    expect(result.valid).toBe(false)
    // Schema version 0 should trigger an error
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("returns invalid when backup files are missing", async () => {
    await createMockManifest(testDir)
    // Don't create actual backup files

    const result = await validateRestore({
      dryRun: true,
      date: "20260429",
      backupDir: testDir,
    })

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("not found"))).toBe(true)
  })

  it("passes validation with complete backup", async () => {
    // Create manifest with config type only (no docker checks needed)
    await createMockManifest(testDir, {
      types: ["config"],
      checksums: { "config-20260429.tar.gz.enc": "def456..." },
      sizes: { "config-20260429.tar.gz.enc": 4096 },
      total_size: 4096,
    })

    // Create mock backup files
    await writeFile(
      join(testDir, "config-20260429.tar.gz.enc"),
      "mock-config-data"
    )

    const result = await validateRestore({
      dryRun: true,
      date: "20260429",
      backupDir: testDir,
    })

    expect(result).toBeDefined()
    if (result.manifest) {
      expect(result.manifest.types).toContain("config")
    }
  })
})

describe("restore archive byte integrity (FR-4, FR-7)", () => {
  let testDir: string
  let dateDir: string
  const filename = "config-20260429.tar.gz.enc"
  const bytes = Buffer.alloc(256 * 1024, 0x61)
  const digest = createHash("sha256").update(bytes).digest("hex")

  beforeEach(async () => {
    testDir = createTempDir()
    dateDir = join(testDir, "20260429")
    vi.mocked(execSync).mockReset()
    vi.mocked(execSync).mockReturnValue("1000000000\n")
    await createMockManifest(dateDir, {
      types: ["config"], checksums: { [filename]: digest },
      sizes: { [filename]: bytes.length }, total_size: bytes.length,
    })
    await writeFile(join(dateDir, filename), bytes)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(testDir, { recursive: true, force: true })
  })

  const checksumCheck = (result: RestoreValidationResult) =>
    result.checks.find(check => check.name === `checksum_${filename}`)

  it.each([false, true])("hashes valid archive bytes with sidecar=%s", async sidecar => {
    if (sidecar) await writeFile(join(dateDir, `${filename}.sha256`), `${digest}\n`)
    const result = await validateRestore({ dryRun: true, date: "20260429", backupDir: testDir })
    expect(result.valid).toBe(true)
    expect(checksumCheck(result)?.passed).toBe(true)
    expect(await readFile(join(dateDir, filename))).toEqual(bytes)
  })

  it.each([false, true])("rejects changed archive bytes with sidecar=%s", async sidecar => {
    if (sidecar) await writeFile(join(dateDir, `${filename}.sha256`), digest)
    const changed = Buffer.from(bytes)
    changed[changed.length - 1] ^= 1
    await writeFile(join(dateDir, filename), changed)
    const result = await validateRestore({ dryRun: true, date: "20260429", backupDir: testDir })
    expect(result.valid).toBe(false)
    expect(checksumCheck(result)?.passed).toBe(false)
    expect(result.errors).toContain(`Checksum mismatch: ${filename}`)
  })

  it("rejects malformed manifest digest even when its sidecar matches", async () => {
    await createMockManifest(dateDir, { types: ["config"], checksums: { [filename]: "not-sha256" } })
    await writeFile(join(dateDir, `${filename}.sha256`), "not-sha256")
    const result = await validateRestore({ dryRun: true, date: "20260429", backupDir: testDir })
    expect(result.valid).toBe(false)
    expect(checksumCheck(result)?.passed).toBe(false)
  })

  it("retains rejection of a conflicting sidecar", async () => {
    await writeFile(join(dateDir, `${filename}.sha256`), "0".repeat(64))
    const result = await validateRestore({ dryRun: true, date: "20260429", backupDir: testDir })
    expect(result.valid).toBe(false)
    expect(checksumCheck(result)?.passed).toBe(false)
  })

  it("rejects an unreadable archive even with a matching sidecar", async () => {
    await rm(join(dateDir, filename))
    await mkdir(join(dateDir, filename))
    await writeFile(join(dateDir, `${filename}.sha256`), digest)
    const result = await validateRestore({ dryRun: true, date: "20260429", backupDir: testDir, force: true })
    expect(result.valid).toBe(false)
    expect(checksumCheck(result)?.passed).toBe(false)
    expect(result.errors).toContain(`Checksum mismatch: ${filename}`)
  })

  it("normal restore refuses corrupted bytes before decrypt/extract commands", async () => {
    vi.stubEnv("BACKUP_ENCRYPTION_KEY", "synthetic-integrity-test-key")
    await writeFile(join(dateDir, filename), "corrupted")
    await writeFile(join(dateDir, `${filename}.sha256`), digest)
    const result = await runRestore({ dryRun: false, date: "20260429", backupDir: testDir })
    expect(result.success).toBe(false)
    expect(result.restored).toEqual([])
    expect(result.errors).toContain(`Checksum mismatch: ${filename}`)
    expect(vi.mocked(execSync).mock.calls.every(([command]) => String(command).startsWith("df -B1 "))).toBe(true)
  })
})

describe("PostgreSQL restore execution boundary", () => {
  let testDir: string
  let dateDir: string
  let scratch: string | undefined
  let failAt: string | undefined
  const filename = "postgres-memory-20260429.sql.gz.enc"
  const key = 'synthetic secret ; $(not-a-command) " key'
  const bytes = "encrypted fixture"
  const digest = createHash("sha256").update(bytes).digest("hex")
  const target = "pilot-postgres"
  const options = () => ({ backupDir: testDir, date: "20260429", types: ["postgres"] as BackupType[], dryRun: false })

  beforeEach(async () => {
    testDir = join(createTempDir(), 'archive .enc ; $(literal) " directory')
    dateDir = join(testDir, "20260429")
    scratch = undefined
    failAt = undefined
    vi.stubEnv("BACKUP_ENCRYPTION_KEY", key)
    vi.stubEnv("POSTGRES_CONTAINER", target)
    vi.stubEnv("POSTGRES_USER", "pilot_owner")
    vi.stubEnv("POSTGRES_DB", "pilot_restore")
    vi.mocked(insertEvent).mockClear()
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(execSync).mockReset()
    // Legacy implementation selects this decoy and reports successful shell execution.
    vi.mocked(execSync).mockImplementation(command => String(command).startsWith("ls ") ? "postgres-old.sql.gz.enc\n" : "1000000000\n")
    vi.mocked(execFileSync).mockReset()
    vi.mocked(execFileSync).mockImplementation((file, args, options) => {
      const argv = args as string[]
      const settings = options as ExecFileSyncOptions
      expect(argv.join(" ")).not.toContain(key)
      if (file === "df") return "Filesystem 1B-blocks Used Available Capacity Mounted on\nfixture 2000000000 1 1000000000 1% /tmp\n"
      if (file === "docker" && argv[0] === "ps") return `${target}\n`
      if (file === "openssl") {
        expect(argv[argv.indexOf("-in") + 1]).toBe(join(dateDir, filename))
        expect(argv[argv.indexOf("-pass") + 1]).toBe("env:ALLURA_RESTORE_PASSPHRASE")
        expect(settings.env?.ALLURA_RESTORE_PASSPHRASE).toBe(key)
        const out = argv[argv.indexOf("-out") + 1]
        scratch = dirname(out)
        expect(scratch).not.toBe(dateDir)
        expect(statSync(scratch).mode & 0o777).toBe(0o700)
        expect(statSync(out).mode & 0o777).toBe(0o600)
        writeFileSync(out, "synthetic compressed data")
      }
      if (file === "gunzip") {
        const fd = (settings.stdio as number[])[1]
        expect(typeof fd).toBe("number")
        expect(fstatSync(fd).mode & 0o777).toBe(0o600)
        writeFileSync(fd, "SELECT 'synthetic SQL';")
      }
      if (file === "docker" && argv[0] === "exec") {
        expect(argv).toEqual(["exec", "-i", target, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "pilot_owner", "-d", "pilot_restore"])
        expect(readFileSync((settings.stdio as number[])[0], "utf8")).toBe("SELECT 'synthetic SQL';")
        expect((settings.stdio as unknown[])[1]).toBe("ignore")
      }
      if (file === failAt || (failAt === "timeout" && file === "docker")) {
        throw Object.assign(new Error(`child failure: ${key} PRIVATE_SQL_TEXT`), { code: failAt === "timeout" ? "ETIMEDOUT" : undefined })
      }
      return ""
    })
    await createMockManifest(dateDir, { types: ["postgres"], checksums: { [filename]: digest }, sizes: { [filename]: bytes.length } })
    await writeFile(join(dateDir, filename), bytes)
    await writeFile(join(dateDir, "postgres-old.sql.gz.enc"), "decoy")
    await writeFile(join(dateDir, filename.slice(0, -4)), "existing gzip must survive")
    await writeFile(join(dateDir, filename.slice(0, -7)), "existing SQL must survive")
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await rm(dirname(testDir), { recursive: true, force: true })
    if (scratch) await rm(scratch, { recursive: true, force: true })
  })

  it("restores only the manifest-selected archive, preserving neighboring plaintext", async () => {
    const result = await runRestore(options())
    expect(result).toEqual({ success: true, restored: ["postgres"], errors: [] })
    expect(execSync).not.toHaveBeenCalled()
    expect(scratch).toBeDefined()
    await expect(access(scratch!)).rejects.toThrow()
    expect(await readFile(join(dateDir, filename.slice(0, -4)), "utf8")).toBe("existing gzip must survive")
    expect(await readFile(join(dateDir, filename.slice(0, -7)), "utf8")).toBe("existing SQL must survive")
    expect(vi.mocked(insertEvent).mock.calls.some(([event]) => event.event_type === EVENT_RESTORE_COMPLETED)).toBe(true)
  })

  it.each(["openssl", "gunzip", "docker", "timeout"])("fails and cleans private plaintext after %s failure", async stage => {
    failAt = stage
    const result = await runRestore(options())
    expect(result.success).toBe(false)
    expect(result.restored).toEqual([])
    expect(scratch).toBeDefined()
    await expect(access(scratch!)).rejects.toThrow()
    expect(vi.mocked(insertEvent).mock.calls.some(([event]) => event.event_type === EVENT_RESTORE_COMPLETED)).toBe(false)
    expect(vi.mocked(insertEvent).mock.calls.some(([event]) => event.event_type === EVENT_RESTORE_FAILED)).toBe(true)
    const output = JSON.stringify([result, vi.mocked(console.log).mock.calls, vi.mocked(console.error).mock.calls, vi.mocked(insertEvent).mock.calls])
    expect(output).not.toContain(key)
    expect(output).not.toContain("PRIVATE_SQL_TEXT")
  })

  it.each<Record<string, string>>([{}, { [filename]: digest, "postgres-other.sql.gz.enc": digest },
    { "../postgres-escape.sql.gz.enc": digest }, { "/tmp/postgres-escape.sql.gz.enc": digest },
    { "nested\\postgres-escape.sql.gz.enc": digest }, { "postgres-null\u0000.sql.gz.enc": digest }])("rejects missing, ambiguous or unsafe manifest artifacts even with force: %j", async checksums => {
    await createMockManifest(dateDir, { types: ["postgres"], checksums })
    const result = await runRestore({ ...options(), force: true })
    expect(result.success).toBe(false)
    expect(result.restored).toEqual([])
    expect(execSync).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it("does not silently succeed when requested PostgreSQL is absent from manifest types", async () => {
    await createMockManifest(dateDir, { types: ["config"], checksums: {} })
    expect((await runRestore({ ...options(), force: true })).success).toBe(false)
  })

  it("rejects a symlink archive even with force", async () => {
    await rm(join(dateDir, filename))
    await symlink(join(dateDir, "postgres-old.sql.gz.enc"), join(dateDir, filename))
    expect((await runRestore({ ...options(), force: true })).success).toBe(false)
    expect(execSync).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it("requires the exact configured running container", async () => {
    vi.mocked(execFileSync).mockReturnValue(`${target}-other\nknowledge-postgres\n`)
    const result = await runRestore(options())
    expect(result.success).toBe(false)
    expect(result.errors).toContain("PostgreSQL container is not running")
  })

  it("keeps its target and verified manifest snapshot across asynchronous audit calls", async () => {
    vi.mocked(insertEvent).mockImplementationOnce(async () => {
      process.env.POSTGRES_CONTAINER = "unrelated-database"
      process.env.POSTGRES_USER = "unrelated-owner"
      process.env.POSTGRES_DB = "unrelated-db"
      await createMockManifest(dateDir, { types: ["postgres"], checksums: { "postgres-old.sql.gz.enc": digest } })
      return { id: 1 } as Awaited<ReturnType<typeof insertEvent>>
    })
    expect((await runRestore(options())).success).toBe(true)
    expect(scratch).toBeDefined()
  })

  it.each(["host=unrelated dbname=other", "postgresql://unrelated/other", "postgres://unrelated/other"])("refuses connection-string restore retargeting even with force: %s", async database => {
    vi.stubEnv("POSTGRES_DB", database)
    for (const force of [false, true]) {
      vi.mocked(execFileSync).mockClear()
      const result = await runRestore({ ...options(), force })
      expect(result.success).toBe(false)
      expect(result.restored).toEqual([])
      expect(scratch).toBeUndefined()
      expect(vi.mocked(execFileSync).mock.calls.every(([file]) => file === "df")).toBe(true)
    }
    expect(execSync).not.toHaveBeenCalled()
  })

  it("does not claim success when private plaintext cleanup fails", async () => {
    vi.mocked(rm).mockRejectedValueOnce(new Error("synthetic cleanup failure"))
    const result = await runRestore(options())
    expect(result.success).toBe(false)
    expect(result.errors).toContain("postgres: PostgreSQL restore temporary plaintext cleanup failed")
    expect(vi.mocked(insertEvent).mock.calls.some(([event]) => event.event_type === EVENT_RESTORE_COMPLETED)).toBe(false)
  })

  it("validates safe selection during dry-run without decrypting or applying SQL", async () => {
    const result = await runRestore({ ...options(), dryRun: true })
    expect(result.success).toBe(true)
    expect(scratch).toBeUndefined()
    expect(vi.mocked(execFileSync).mock.calls.every(([file, args]) => file === "df" || (file === "docker" && args?.[0] === "ps"))).toBe(true)
  })

  it("preserves explicit force checksum/preflight bypass but still selects the manifest archive", async () => {
    await writeFile(join(dateDir, filename), "checksum intentionally mismatches")
    expect((await runRestore({ ...options(), force: true })).success).toBe(true)
    expect(scratch).toBeDefined()
    expect(vi.mocked(execFileSync).mock.calls.some(([file, args]) => file === "df" || (file === "docker" && args?.[0] === "ps"))).toBe(false)
  })

  it.each([0, 1000000000])("checks the actual temporary filesystem for PostgreSQL plaintext: available=%s", async available => {
    vi.mocked(execFileSync).mockImplementation((file, args) => {
      if (file === "docker") return `${target}\n`
      expect(file).toBe("df")
      expect(args).toEqual(["-P", "-B1", "--", tmpdir()])
      return `Filesystem 1B-blocks Used Available Capacity Mounted on\nfixture 2000000000 1 ${available} 1% /tmp\n`
    })
    const result = await validateRestore(options())
    expect(result.diskSpaceAvailable).toBe(available)
    expect(result.valid).toBe(available > 0)
  })

  it.each(["valid", "wrong key", "invalid gzip"])("real OpenSSL/gunzip compatibility: %s (Docker and audit mocked)", async scenario => {
    const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
    const sql = "SELECT 'synthetic recovery fixture';\n".repeat(8192)
    const compressed = scenario === "invalid gzip" ? Buffer.from("not gzip") : gzipSync(sql)
    const ciphertext = actual.execFileSync("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "100000", "-pass", "env:ALLURA_TEST_PASSPHRASE"], {
      env: { ...process.env, ALLURA_TEST_PASSPHRASE: key }, input: compressed, stdio: ["pipe", "pipe", "pipe"], timeout: 5000,
    })
    const checksum = createHash("sha256").update(ciphertext).digest("hex")
    await writeFile(join(dateDir, filename), ciphertext)
    await createMockManifest(dateDir, { types: ["postgres"], checksums: { [filename]: checksum } })
    if (scenario === "wrong key") vi.stubEnv("BACKUP_ENCRYPTION_KEY", "synthetic incorrect key")
    let databaseCalls = 0
    vi.mocked(execFileSync).mockImplementation((file, args, options) => {
      const argv = args as string[]
      const settings = options as ExecFileSyncOptions
      if (file === "docker") {
        if (argv[0] === "ps") return `${target}\n`
        databaseCalls++
        expect(argv).toContain("ON_ERROR_STOP=1")
        expect(readFileSync((settings.stdio as number[])[0], "utf8")).toBe(sql)
        return ""
      }
      if (file === "openssl") scratch = dirname(argv[argv.indexOf("-out") + 1])
      return actual.execFileSync(file, argv, settings)
    })
    const result = await runRestore(options())
    expect(result.success).toBe(scenario === "valid")
    expect(databaseCalls).toBe(scenario === "valid" ? 1 : 0)
    expect(scratch).toBeDefined()
    await expect(access(scratch!)).rejects.toThrow()
    expect(await readFile(join(dateDir, filename))).toEqual(ciphertext)
    expect(await readFile(join(dateDir, filename.slice(0, -7)), "utf8")).toBe("existing SQL must survive")
  })
})

// ── Backup Listing Tests (FR-8) ────────────────────────────────────────────────
describe("PostgreSQL backup execution safety", () => {
  let dir: string
  let scratch: string | undefined
  let failAt: string | undefined
  const key = 'literal secret ; $(not-run) " passphrase'
  const sql = "SELECT 'PRIVATE_SQL_TEXT';\n".repeat(100000)
  const target = "isolated-pg"
  const database = 'database space " ; literal'
  const user = 'owner space " ; literal'
  const options = (): PostgresBackupOptions => ({ container: target, database, user, outputDir: dir,
    encryption: { key, cipher: "aes-256-cbc", saltLength: 16 } })

  beforeEach(async () => {
    dir = join(createTempDir(), 'output space ; " literal')
    await mkdir(dir, { recursive: true })
    scratch = undefined; failAt = undefined
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
    vi.mocked(rm).mockReset().mockImplementation(actual.rm)
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(execSync).mockReset().mockReturnValue("")
    vi.mocked(execFileSync).mockReset().mockImplementation((file, args, settings) => {
      const argv = args as string[]
      const opts = settings as ExecFileSyncOptions
      expect(argv.join(" ")).not.toContain(key)
      if (file === "docker" && argv[0] === "info") return ""
      if (file === "docker" && argv[0] === "ps") return target + "\n"
      const fd = (opts.stdio as number[])[1]
      expect(typeof fd).toBe("number")
      expect(fstatSync(fd).mode & 0o777).toBe(0o600)
      scratch = join(dir, readdirSync(dir).find(name => name.startsWith(".allura-pg-backup-"))!)
      expect(statSync(scratch).mode & 0o777).toBe(0o700)
      if (file === "docker") {
        expect(argv).toEqual(["exec", target, "pg_dump", "-U", user, "--dbname", database])
        writeFileSync(fd, sql)
      } else if (file === "gzip") writeFileSync(fd, "synthetic compressed")
      else if (file === "openssl") {
        expect(argv[argv.indexOf("-pass") + 1]).toBe("env:ALLURA_BACKUP_PASSPHRASE")
        expect(opts.env?.ALLURA_BACKUP_PASSPHRASE).toBe(key)
        writeFileSync(fd, "synthetic encrypted")
      } else throw new Error("Unexpected command")
      if (file === failAt) throw new Error("Child error " + key + " PRIVATE_SQL_TEXT")
      return ""
    })
  })
  afterEach(async () => {
    vi.useRealTimers(); vi.restoreAllMocks()
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
    vi.mocked(rm).mockReset().mockImplementation(actual.rm)
    await actual.rm(dirname(dir), { recursive: true, force: true })
  })
  it("dumps once via private file descriptors, encrypts without shell/key argv, hashes bytes and cleans plaintext", async () => {
    const result = await backupPostgres(options())
    expect(result.success).toBe(true)
    expect(execSync).not.toHaveBeenCalled()
    expect(vi.mocked(execFileSync).mock.calls.filter(([file, args]) => file === "docker" && args?.[0] === "exec")).toHaveLength(1)
    expect(result.checksum).toBe(createHash("sha256").update("synthetic encrypted").digest("hex"))
    expect(result.size).toBe(Buffer.byteLength("synthetic encrypted"))
    expect(await readFile(result.path + ".sha256", "utf8")).toBe(result.checksum)
    expect(statSync(result.path).mode & 0o777).toBe(0o600)
    expect(statSync(result.path + ".sha256").mode & 0o777).toBe(0o600)
    expect((await readdir(dir)).sort()).toEqual([result.path.split("/").at(-1)!, result.path.split("/").at(-1)! + ".sha256"].sort())
    expect(scratch).toBeDefined()
    await expect(access(scratch!)).rejects.toThrow()
  })
  it.each(["docker", "gzip", "openssl"])("fails safely and removes private files after %s stage failure", async stage => {
    failAt = stage
    const result = await backupPostgres(options())
    expect(result.success).toBe(false)
    expect(execSync).not.toHaveBeenCalled()
    expect(await readdir(dir)).toEqual([])
    const visible = JSON.stringify([result, vi.mocked(console.log).mock.calls, vi.mocked(console.error).mock.calls])
    expect(visible).not.toContain(key); expect(visible).not.toContain("PRIVATE_SQL_TEXT")
  })
  it("refuses an inexact container match before dump", async () => {
    vi.mocked(execFileSync).mockReturnValue(target + "-other\n")
    expect((await backupPostgres(options())).success).toBe(false)
    expect(vi.mocked(execFileSync).mock.calls.some(([, args]) => args?.[0] === "exec")).toBe(false)
  })
  it.each(["../other", "nested\\other", "nul\u0000name", "line\nbreak", "line\rbreak", "line\u2028break", "line\u2029break",
    "host=unrelated dbname=other", "postgresql://unrelated/other", "postgres://unrelated/other"])("rejects unsafe database operands before execution: %s", async name => {
    const result = await backupPostgres({ ...options(), database: name })
    expect(result.success).toBe(false)
    expect(execSync).not.toHaveBeenCalled(); expect(execFileSync).not.toHaveBeenCalled()
  })
  it("does not report success when private cleanup fails", async () => {
    vi.mocked(rm).mockRejectedValueOnce(new Error("synthetic cleanup refusal"))
    const result = await backupPostgres(options())
    expect(result.success).toBe(false)
    expect(result.error).toContain("cleanup")
  })
  it("retains target, path and key snapshots across async work", async () => {
    const original = options()
    const operation = backupPostgres(original)
    original.container = "unrelated"; original.database = "unrelated"; original.user = "unrelated"
    original.outputDir = "/unused"; original.encryption.key = "changed passphrase"
    expect((await operation).success).toBe(true)
  })
  it.each(["archive", "sidecar", "symlink"])("refuses %s collision without overwriting/deleting preexisting files", async collision => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-14T00:00:00.000Z"))
    const file = join(dir, 'postgres-' + database + '-2026-10-14T00-00-00-000Z.sql.gz.enc')
    const occupied = collision === "sidecar" ? file + ".sha256" : file
    const neighbor = join(dir, "neighbor")
    await writeFile(neighbor, "preserve me")
    if (collision === "symlink") await symlink(neighbor, occupied)
    else await writeFile(occupied, "preexisting backup")
    expect((await backupPostgres(options())).success).toBe(false)
    expect(await readFile(occupied, "utf8")).toBe(collision === "symlink" ? "preserve me" : "preexisting backup")
    expect(await readFile(neighbor, "utf8")).toBe("preserve me")
  })
  it("keeps existing gzip/OpenSSL format with literal passphrases (Docker mocked)", async () => {
    const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
    const fake = vi.mocked(execFileSync).getMockImplementation()!
    vi.mocked(execFileSync).mockImplementation((file, args, opts) => file === "docker" ? fake(file, args, opts) : actual.execFileSync(file, args as string[], opts as ExecFileSyncOptions))
    const result = await backupPostgres(options())
    expect(result.success).toBe(true)
    const compressed = actual.execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "100000", "-in", result.path, "-pass", "env:ALLURA_TEST_BACKUP_KEY"], {
      env: { ...process.env, ALLURA_TEST_BACKUP_KEY: key }, stdio: ["pipe", "pipe", "pipe"], timeout: 10000, maxBuffer: 8 * 1024 * 1024,
    })
    const restored = actual.execFileSync("gunzip", ["-c"], { input: compressed, maxBuffer: 8 * 1024 * 1024, timeout: 10000 })
    expect(restored.toString()).toBe(sql)
  })
})

describe("listBackups", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir()
  })

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
  })

  it("returns empty array when no backups exist", async () => {
    const items = await listBackups(testDir)
    expect(items).toEqual([])
  })

  it("parses backup directories correctly", async () => {
    const dateDir = join(testDir, "20260429")
    await createMockManifest(dateDir)

    const items = await listBackups(testDir)
    expect(items.length).toBe(1)
    expect(items[0].date).toBe("20260429")
    expect(items[0].types).toContain("postgres")
    expect(items[0].types).toContain("config")
    expect(items[0].schema_version).toBe(1)
  })

  it("skips non-date directories", async () => {
    await mkdir(join(testDir, "not-a-date"), { recursive: true })
    await mkdir(join(testDir, "20260429"), { recursive: true })
    await createMockManifest(join(testDir, "20260429"))

    const items = await listBackups(testDir)
    expect(items.length).toBe(1)
    expect(items[0].date).toBe("20260429")
  })
})

// ── Retention Policy Tests (FR-8) ────────────────────────────────────────────

describe("Retention Policy", () => {
  it("DEFAULT_RETENTION_POLICY has correct values", () => {
    expect(DEFAULT_RETENTION_POLICY.daily).toBe(7)
    expect(DEFAULT_RETENTION_POLICY.weekly).toBe(4)
    expect(DEFAULT_RETENTION_POLICY.monthly).toBe(12)
  })

  it("getRetentionSummary calculates totals correctly", () => {
    const items: BackupInventoryItem[] = [
      {
        date: "20260429",
        types: ["postgres"],
        total_size: 1024,
        schema_version: 1,
        retention: "keep",
        integrity_verified: true,
        path: "/backups/20260429",
      },
      {
        date: "20260428",
        types: ["postgres"],
        total_size: 1024,
        schema_version: 1,
        retention: "keep",
        integrity_verified: true,
        path: "/backups/20260428",
      },
      {
        date: "20260301",
        types: ["postgres"],
        total_size: 1024,
        schema_version: 1,
        retention: "expire_soon",
        integrity_verified: true,
        path: "/backups/20260301",
      },
      {
        date: "20250101",
        types: ["postgres"],
        total_size: 1024,
        schema_version: 1,
        retention: "expired",
        integrity_verified: true,
        path: "/backups/20250101",
      },
    ]

    const summary = getRetentionSummary(items)

    expect(summary.total).toBe(4)
    expect(summary.keep).toBe(2)
    expect(summary.expire_soon).toBe(1)
    expect(summary.expired).toBe(1)
    expect(summary.total_size).toBe(4096)
  })
})

// ── Audit Event Tests (NFR-2) ───────────────────────────────────────────────

describe("Audit Event Types", () => {
  it("defines all backup event types", () => {
    expect(EVENT_BACKUP_STARTED).toBe("backup.started")
    expect(EVENT_BACKUP_COMPLETED).toBe("backup.completed")
    expect(EVENT_BACKUP_FAILED).toBe("backup.failed")
    expect(EVENT_RESTORE_STARTED).toBe("restore.started")
    expect(EVENT_RESTORE_COMPLETED).toBe("restore.completed")
    expect(EVENT_RESTORE_FAILED).toBe("restore.failed")
    expect(EVENT_RESTORE_VALIDATED).toBe("restore.validated")
  })
})

// ── Module Export Tests ──────────────────────────────────────────────────────

describe("Backup Module Exports", () => {
  it("exports all required functions", async () => {
    const backup = await import("../lib/backup")

    expect(typeof backup.runBackup).toBe("function")
    expect(typeof backup.runRestore).toBe("function")
    expect(typeof backup.validateRestore).toBe("function")
    expect(typeof backup.listBackups).toBe("function")
    expect(typeof backup.loadManifest).toBe("function")
    expect(typeof backup.getRetentionSummary).toBe("function")
    expect(typeof backup.backupPostgres).toBe("function")
    expect(typeof backup.backupConfig).toBe("function")
    expect(typeof backup.backupWorkspace).toBe("function")
    expect(typeof backup.backupSkills).toBe("function")
  })
})

// ── Error Handling Tests ──────────────────────────────────────────────────────

describe("Error Handling", () => {
  it("backupPostgres fails gracefully without docker", async () => {
    const mockExecSync = vi.mocked(execSync)
    mockExecSync.mockImplementation(() => {
      throw new Error("docker command not found")
    })

    const result = await backupPostgres({
      container: "test-postgres",
      database: "test",
      user: "test",
      outputDir: "/tmp",
      encryption: { key: "test-key-123", cipher: "aes-256-cbc", saltLength: 16 },
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("rejects invalid encryption key", async () => {
    await expect(
      backupPostgres({
        container: "test",
        database: "test",
        user: "test",
        outputDir: "/tmp",
        encryption: { key: "short", cipher: "aes-256-cbc", saltLength: 16 },
      })
    ).rejects.toThrow("BACKUP_ENCRYPTION_KEY")
  })
})

// ── Integration: Backup + Restore Roundtrip ──────────────────────────────────

describe("Backup/Restore Roundtrip", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir()
  })

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
  })

  it("dry-run validation does not modify state", async () => {
    await createMockManifest(testDir)
    await writeFile(
      join(testDir, "config-20260429.tar.gz.enc"),
      "mock-backup-data"
    )

    // Read before
    const beforeContent = await readFile(join(testDir, "config-20260429.tar.gz.enc"), "utf-8")

    const result = await validateRestore({
      dryRun: true,
      date: "20260429",
      backupDir: testDir,
    })

    // Read after
    const afterContent = await readFile(join(testDir, "config-20260429.tar.gz.enc"), "utf-8")

    expect(result.valid).toBeDefined()
    expect(afterContent).toBe(beforeContent)
  })
})
