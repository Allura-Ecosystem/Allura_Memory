/**
 * Backup Types — Type definitions for the backup automation system
 *
 * FR-3: Automated daily backups with encryption
 * FR-4: Restore with dry-run mode
 * FR-7: Backup manifest with integrity checksums
 * FR-8: Backup listing with retention policy
 * FR-9: Selective restore by type
 * NFR-1: Secrets redaction in logs
 * NFR-2: All operations emit audit events
 */

// ── Core Types ──────────────────────────────────────────────────────────────

export type BackupType = "postgres" | "config" | "workspace" | "skills" | "full"

export const ALL_BACKUP_TYPES: BackupType[] = [
  "postgres",
  "config",
  "workspace",
  "skills",
]

export interface BackupManifest {
  /** ISO 8601 timestamp when backup was created */
  timestamp: string
  /** Date string in YYYYMMDD format */
  date: string
  /** Types included in this backup */
  types: BackupType[]
  /** Schema version for compatibility */
  schema_version: number
  /** Individual file checksums (sha256) */
  checksums: Record<string, string>
  /** File sizes in bytes */
  sizes: Record<string, number>
  /** Total backup size in bytes */
  total_size: number
  /** Backup duration in milliseconds */
  duration_ms: number
  /** Whether all integrity checks passed */
  integrity_verified: boolean
  /** Host that created the backup */
  hostname: string
  /** Version of backup software */
  backup_version: string
}

export interface BackupResult {
  /** Whether the backup succeeded */
  success: boolean
  /** Absolute path to the backup file */
  path: string
  /** Size in bytes */
  size: number
  /** Duration in milliseconds */
  duration_ms: number
  /** SHA-256 checksum */
  checksum: string
  /** Error message if failed */
  error?: string
}

export interface RestoreOptions {
  /** Dry-run: validate without modifying state */
  dryRun: boolean
  /** Target backup date (YYYYMMDD) */
  date?: string
  /** Types to restore (default: all in manifest) */
  types?: BackupType[]
  /** Force restore even if checks warn */
  force?: boolean
  /** Backup directory path */
  backupDir?: string
}

export interface RestoreValidationResult {
  /** Whether preflight checks passed */
  valid: boolean
  /** Individual check results */
  checks: RestoreCheckResult[]
  /** Estimated disk space needed (bytes) */
  diskSpaceNeeded: number
  /** Available disk space (bytes) */
  diskSpaceAvailable: number
  /** Manifest parsed from backup */
  manifest?: BackupManifest
  /** Error messages */
  errors: string[]
}

export interface RestoreCheckResult {
  /** Name of the check */
  name: string
  /** Whether it passed */
  passed: boolean
  /** Details */
  message: string
}

export interface BackupInventoryItem {
  /** Backup date (YYYYMMDD) */
  date: string
  /** Types included */
  types: BackupType[]
  /** Total size */
  total_size: number
  /** Schema version */
  schema_version: number
  /** Retention status */
  retention: RetentionStatus
  /** Whether integrity is verified */
  integrity_verified: boolean
  /** Absolute path */
  path: string
}

export type RetentionStatus = "keep" | "expire_soon" | "expired"

export interface RetentionPolicy {
  /** Number of daily backups to keep */
  daily: number
  /** Number of weekly backups to keep */
  weekly: number
  /** Number of monthly backups to keep */
  monthly: number
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  daily: 7,
  weekly: 4,
  monthly: 12,
}

// ── Encryption ──────────────────────────────────────────────────────────────

export interface EncryptionConfig {
  /** AES-256 encryption key from environment */
  key: string
  /** Cipher algorithm */
  cipher: "aes-256-cbc"
  /** Key derivation salt length */
  saltLength: number
}

// ── Audit Events ────────────────────────────────────────────────────────────

export const EVENT_BACKUP_STARTED = "backup.started"
export const EVENT_BACKUP_COMPLETED = "backup.completed"
export const EVENT_BACKUP_FAILED = "backup.failed"
export const EVENT_RESTORE_STARTED = "restore.started"
export const EVENT_RESTORE_COMPLETED = "restore.completed"
export const EVENT_RESTORE_FAILED = "restore.failed"
export const EVENT_RESTORE_VALIDATED = "restore.validated"
export const EVENT_BACKUP_DELETED = "backup.deleted"

export const BACKUP_EVENT_TYPES = [
  EVENT_BACKUP_STARTED,
  EVENT_BACKUP_COMPLETED,
  EVENT_BACKUP_FAILED,
  EVENT_RESTORE_STARTED,
  EVENT_RESTORE_COMPLETED,
  EVENT_RESTORE_FAILED,
  EVENT_RESTORE_VALIDATED,
  EVENT_BACKUP_DELETED,
] as const

export type BackupEventType = typeof BACKUP_EVENT_TYPES[number]

// ── Worker Configuration ────────────────────────────────────────────────────

export interface BackupWorkerConfig {
  /** Backup storage directory */
  backupDir: string
  /** Encryption key (from env) */
  encryptionKey: string
  /** Docker container names */
  containers: {
    postgres: string
  }
  /** Database names */
  databases: {
    postgres: string
  }
  /** PostgreSQL user */
  postgresUser: string
  /** Workspace root to backup */
  workspaceRoot: string
  /** Skills directories */
  skillsDirs: string[]
  /** Files to include in config backup */
  configFiles: string[]
}

// ── Constants ───────────────────────────────────────────────────────────────

export const BACKUP_VERSION = "1.0.0"
export const MANIFEST_FILENAME = "BackupManifest.json"
export const MIN_SUPPORTED_BACKUP_VERSION = 1

/** Files to include in config backup */
export const DEFAULT_CONFIG_FILES = [
  ".env",
  ".env.local",
  ".env.example",
  "docker-compose.yml",
  "docker-compose.yaml",
  "vitest.config.ts",
  "vitest.config.unit.ts",
  "vitest.config.integration.ts",
  "vitest.config.e2e.ts",
  "tsconfig.json",
  "package.json",
]

/** Skills directories to backup */
export const DEFAULT_SKILLS_DIRS = [
  "~/.openclaw/workspace/skills",
  "~/.agents/skills",
  "~/.claude/skills",
  "~/.opencode/skills",
]

/** Workspace memory files */
export const DEFAULT_WORKSPACE_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "MEMORY.md",
]

/** Workspace memory directories */
export const DEFAULT_WORKSPACE_DIRS = [
  "memory",
  ".openclaw",
]
