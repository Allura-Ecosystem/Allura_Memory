/**
 * Backup Automation Module — Public API
 *
 * FR-3, FR-4, FR-7, FR-8, FR-9, NFR-1, NFR-2
 *
 * Usage:
 *   import { runBackup, runRestore, listBackups } from "@/lib/backup"
 *
 *   // Run full backup
 *   await runBackup(["full"])
 *
 *   // Restore with dry-run
 *   const result = await runRestore({ dryRun: true, date: "20260429" })
 *
 *   // List backups
 *   const inventory = await listBackups()
 */

export {
  runBackup,
  getDefaultConfig,
} from "./worker"

export {
  runRestore,
  validateRestore,
  loadManifest,
  listBackups,
  getRetentionSummary,
} from "./restore"

export {
  backupPostgres,
} from "./postgres"

export {
  backupConfig,
} from "./config"

export {
  backupWorkspace,
} from "./workspace"

export {
  backupSkills,
} from "./skills"

export type {
  BackupType,
  BackupManifest,
  BackupResult,
  BackupWorkerConfig,
  RestoreOptions,
  RestoreValidationResult,
  RestoreCheckResult,
  BackupInventoryItem,
  RetentionStatus,
  RetentionPolicy,
  EncryptionConfig,
} from "./types"

export {
  ALL_BACKUP_TYPES,
  DEFAULT_RETENTION_POLICY,
  DEFAULT_CONFIG_FILES,
  DEFAULT_WORKSPACE_FILES,
  DEFAULT_WORKSPACE_DIRS,
  MANIFEST_FILENAME,
  BACKUP_VERSION,
  MIN_SUPPORTED_BACKUP_VERSION,
  EVENT_BACKUP_STARTED,
  EVENT_BACKUP_COMPLETED,
  EVENT_BACKUP_FAILED,
  EVENT_RESTORE_STARTED,
  EVENT_RESTORE_COMPLETED,
  EVENT_RESTORE_FAILED,
  EVENT_RESTORE_VALIDATED,
  EVENT_BACKUP_DELETED,
} from "./types"
