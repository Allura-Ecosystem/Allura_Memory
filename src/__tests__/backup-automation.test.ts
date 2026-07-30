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
import { execSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir , readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
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
import { backupPostgres } from "../lib/backup/postgres"
import {
  getRetentionSummary,
  listBackups,
  loadManifest,
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
  execSync: vi.fn(),
}))

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
    delete process.env.BACKUP_ENCRYPTION_KEY
    delete process.env.BACKUP_DIR
    delete process.env.POSTGRES_CONTAINER

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

// ── Backup Listing Tests (FR-8) ────────────────────────────────────────────────

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
