import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { createMemoryClient, type MemoryClient } from "./helpers/memory-client";
import {
  SNAPSHOT_DEFAULT_OUTPUT_DIR,
  SNAPSHOT_INGESTION_METADATA_FILENAME,
  SNAPSHOT_INGESTION_SCHEMA_VERSION,
  SNAPSHOT_JSON_FILENAME,
  type SnapshotEntry,
  type SnapshotFileHashes,
  type SnapshotIngestionMetadata,
  type SnapshotIngestionMetadataHistoryFile,
} from "./helpers/snapshot-types";
import { type InsightRecord, InsightValidationError } from "./lib/neo4j-stub";
import type { EventRecord } from "../src/lib/postgres/queries/insert-trace";
import { validateGroupId } from "../src/lib/validation/group-id";

type HydrationErrorCode = "CONFIG" | "SNAPSHOT_MISSING" | "IO" | "UNKNOWN";

const HYDRATION_AGENT_ID = "memory-snapshot-hydrator";
const HYDRATION_WORKFLOW_ID = "memory-snapshot-hydration";
const SESSION_BRIEFING_EVENT = "session_briefing";
const SESSION_BRIEFING_COMPLETED_EVENT = "session_briefing_completed";
const ENTRY_EVENT_TYPE = "memory_snapshot_entry";
const DEFAULT_INGESTION_CONCURRENCY = 5;

export class HydrationError extends Error {
  public readonly code: HydrationErrorCode;

  constructor(message: string, code: HydrationErrorCode = "UNKNOWN") {
    super(message);
    this.name = "HydrationError";
    this.code = code;
  }
}

export interface HydrationOptions {
  snapshotPath: string;
  ingestionMetadataPath: string;
  groupId: string;
  dryRun: boolean;
  concurrency: number;
}

export interface HydrationRunResult {
  options: HydrationOptions;
  snapshotEntries: SnapshotEntry[];
  changedEntries: SnapshotEntry[];
  previousIngestionMetadata: SnapshotIngestionMetadata;
  nextIngestionMetadata: SnapshotIngestionMetadata;
  loggedEvents: EventRecord[];
  ingestedInsights: InsightRecord[];
}

export interface HydrationDependencies {
  readFile: typeof fs.readFile;
  writeFile: typeof fs.writeFile;
  mkdir: typeof fs.mkdir;
  now: () => Date;
  memoryClient: MemoryClient;
}

interface LoadedIngestionMetadataState {
  latest: SnapshotIngestionMetadata;
  history: SnapshotIngestionMetadata[];
}

interface EntryChangeSummary {
  newEntries: number;
  updatedEntries: number;
}

const defaultDependencies: HydrationDependencies = {
  readFile: fs.readFile.bind(fs),
  writeFile: fs.writeFile.bind(fs),
  mkdir: fs.mkdir.bind(fs),
  now: () => new Date(),
  memoryClient: createMemoryClient(),
};

export async function runHydrationCli(
  argv?: string[],
  overrides?: Partial<HydrationDependencies>,
): Promise<HydrationRunResult> {
  const args = argv ?? process.argv.slice(2);
  const options = parseCliArgs(args, process.cwd());
  try {
    const result = await hydrateSessionFromSnapshot(options, overrides);
    logSummary(result, options.dryRun);
    return result;
  } catch (error) {
    if (error instanceof HydrationError) {
      throw error;
    }
    throw new HydrationError((error as Error).message ?? "Unknown error");
  }
}

export async function hydrateSessionFromSnapshot(
  options: HydrationOptions,
  overrides?: Partial<HydrationDependencies>,
): Promise<HydrationRunResult> {
  const dependencies = mergeDependencies(overrides);
  const validatedGroupId = validateGroupId(options.groupId);

  const snapshotEntries = await loadSnapshotEntries(options.snapshotPath, dependencies);
  const ingestionState = await loadIngestionMetadata(
    options.ingestionMetadataPath,
    dependencies,
  );
  const previousMetadata = await resolvePreviousMetadataFromEvents(
    ingestionState,
    validatedGroupId,
    dependencies,
  );

  const changedEntries = determineChangedEntries(snapshotEntries, previousMetadata.entryHashes);
  const changeSummary = summarizeEntryChanges(changedEntries, previousMetadata.entryHashes);
  const nextMetadata: SnapshotIngestionMetadata = {
    schemaVersion: SNAPSHOT_INGESTION_SCHEMA_VERSION,
    groupId: validatedGroupId,
    ingestedAt: dependencies.now().toISOString(),
    entryHashes: buildEntryHashMap(snapshotEntries),
  };

  const actionSummary = options.dryRun
    ? { events: [] as EventRecord[], insights: [] as InsightRecord[] }
    : await executeHydrationActions({
        snapshotEntries,
        changedEntries,
        previousMetadata,
        nextMetadata,
        options,
        dependencies,
        groupId: validatedGroupId,
        changeSummary,
      });

  if (!options.dryRun) {
    await writeIngestionMetadata(
      options.ingestionMetadataPath,
      ingestionState.history,
      nextMetadata,
      dependencies,
    );
  }

  return {
    options: {
      ...options,
      groupId: validatedGroupId,
    },
    snapshotEntries,
    changedEntries,
    previousIngestionMetadata: previousMetadata,
    nextIngestionMetadata: nextMetadata,
    loggedEvents: actionSummary.events,
    ingestedInsights: actionSummary.insights,
  } satisfies HydrationRunResult;
}

function mergeDependencies(overrides?: Partial<HydrationDependencies>): HydrationDependencies {
  if (!overrides) {
    return defaultDependencies;
  }

  return {
    readFile: overrides.readFile ?? defaultDependencies.readFile,
    writeFile: overrides.writeFile ?? defaultDependencies.writeFile,
    mkdir: overrides.mkdir ?? defaultDependencies.mkdir,
    now: overrides.now ?? defaultDependencies.now,
    memoryClient: overrides.memoryClient ?? defaultDependencies.memoryClient,
  } satisfies HydrationDependencies;
}

function parseCliArgs(args: string[], cwd: string): HydrationOptions {
  let snapshotPath: string | undefined;
  let ingestionPath: string | undefined;
  let memoryBankDir = path.resolve(cwd, SNAPSHOT_DEFAULT_OUTPUT_DIR);
  let groupId = "allura-system";
  let dryRun = false;
  let concurrency = DEFAULT_INGESTION_CONCURRENCY;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--snapshot": {
        const value = ensureValue(args, i, "--snapshot");
        snapshotPath = path.resolve(cwd, value);
        i += 1;
        break;
      }
      case "--ingestion-meta": {
        const value = ensureValue(args, i, "--ingestion-meta");
        ingestionPath = path.resolve(cwd, value);
        i += 1;
        break;
      }
      case "--memory-bank": {
        const value = ensureValue(args, i, "--memory-bank");
        memoryBankDir = path.resolve(cwd, value);
        i += 1;
        break;
      }
      case "--group-id": {
        const value = ensureValue(args, i, "--group-id");
        groupId = value;
        i += 1;
        break;
      }
      case "--dry-run": {
        dryRun = true;
        break;
      }
      case "--concurrency": {
        const value = ensureValue(args, i, "--concurrency");
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new HydrationError("--concurrency must be a positive integer", "CONFIG");
        }
        concurrency = parsed;
        i += 1;
        break;
      }
      default:
        throw new HydrationError(`Unknown argument: ${arg}`, "CONFIG");
    }
  }

  const resolvedSnapshot = snapshotPath ?? path.join(memoryBankDir, SNAPSHOT_JSON_FILENAME);
  const resolvedIngestion =
    ingestionPath ?? path.join(memoryBankDir, SNAPSHOT_INGESTION_METADATA_FILENAME);
  assertPathWithinDirectory(resolvedSnapshot, memoryBankDir);

  return {
    snapshotPath: resolvedSnapshot,
    ingestionMetadataPath: resolvedIngestion,
    groupId,
    dryRun,
    concurrency,
  } satisfies HydrationOptions;
}

function ensureValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new HydrationError(`${flag} requires a value`, "CONFIG");
  }
  return value;
}

async function loadSnapshotEntries(
  snapshotPath: string,
  dependencies: HydrationDependencies,
): Promise<SnapshotEntry[]> {
  try {
    const contents = await dependencies.readFile(snapshotPath, "utf-8");
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      throw new HydrationError(
        `Snapshot at ${snapshotPath} is invalid. Expected an array of entries.`,
        "CONFIG",
      );
    }
    return validateSnapshotEntries(parsed, snapshotPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new HydrationError(
        `Snapshot not found at ${snapshotPath}. Run 'bun run snapshot:build' first.`,
        "SNAPSHOT_MISSING",
      );
    }
    if (error instanceof HydrationError) {
      throw error;
    }
    throw new HydrationError(`Failed to read snapshot: ${(err && err.message) || String(error)}`, "IO");
  }
}

async function loadIngestionMetadata(
  ingestionPath: string,
  dependencies: HydrationDependencies,
): Promise<LoadedIngestionMetadataState> {
  try {
    const contents = await dependencies.readFile(ingestionPath, "utf-8");
    const parsed = JSON.parse(contents);
    return parseIngestionMetadataFile(parsed);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return createEmptyIngestionState();
    }
    throw new HydrationError(
      `Failed to read ingestion metadata: ${(err && err.message) || String(error)}`,
      "IO",
    );
  }
}

async function resolvePreviousMetadataFromEvents(
  ingestionState: LoadedIngestionMetadataState,
  groupId: string,
  dependencies: HydrationDependencies,
): Promise<SnapshotIngestionMetadata> {
  const completionEvent = await dependencies.memoryClient.getLatestEventByType(
    groupId,
    SESSION_BRIEFING_COMPLETED_EVENT,
  );

  if (!completionEvent) {
    return ingestionState.latest;
  }

  const eventHashes = parseEntryHashes(completionEvent.metadata.entryHashes);
  if (eventHashes === null) {
    return ingestionState.latest;
  }

  const ingestedAtValue = completionEvent.metadata.ingestedAt;
  const ingestedAt = typeof ingestedAtValue === "string" ? ingestedAtValue : ingestionState.latest.ingestedAt;

  return {
    ...ingestionState.latest,
    groupId: ingestionState.latest.groupId ?? groupId,
    ingestedAt,
    entryHashes: eventHashes,
  } satisfies SnapshotIngestionMetadata;
}

function parseEntryHashes(value: unknown): SnapshotFileHashes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const result: SnapshotFileHashes = {};
  for (const [relativePath, hashValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof hashValue !== "string") {
      return null;
    }
    result[relativePath] = hashValue;
  }
  return result;
}

async function writeIngestionMetadata(
  ingestionPath: string,
  existingHistory: SnapshotIngestionMetadata[],
  metadata: SnapshotIngestionMetadata,
  dependencies: HydrationDependencies,
): Promise<void> {
  await dependencies.mkdir(path.dirname(ingestionPath), { recursive: true });
  const normalizedHistory = existingHistory
    .map((entry) => normalizeIngestionMetadata(entry))
    .filter(hasIngestionData);
  const nextHistory = [...normalizedHistory, normalizeIngestionMetadata(metadata)];
  const payload = `${JSON.stringify(
    {
      schemaVersion: SNAPSHOT_INGESTION_SCHEMA_VERSION,
      history: nextHistory,
    },
    null,
    2,
  )}\n`;
  await dependencies.writeFile(ingestionPath, payload, "utf-8");
}

function normalizeIngestionMetadata(
  metadata: SnapshotIngestionMetadata,
): SnapshotIngestionMetadata {
  const entryHashes: SnapshotFileHashes = metadata.entryHashes ?? {};
  return {
    schemaVersion: metadata.schemaVersion ?? SNAPSHOT_INGESTION_SCHEMA_VERSION,
    groupId: metadata.groupId,
    ingestedAt: metadata.ingestedAt,
    entryHashes,
  } satisfies SnapshotIngestionMetadata;
}

function parseIngestionMetadataFile(value: unknown): LoadedIngestionMetadataState {
  if (isHistoryFile(value)) {
    const normalizedHistory = value.history
      .map((entry) => normalizeIngestionMetadata(entry))
      .filter(hasIngestionData);
    if (normalizedHistory.length === 0) {
      return createEmptyIngestionState();
    }
    return {
      latest: normalizedHistory[normalizedHistory.length - 1]!,
      history: normalizedHistory,
    } satisfies LoadedIngestionMetadataState;
  }

  const normalized = normalizeIngestionMetadata((value ?? {}) as SnapshotIngestionMetadata);
  if (!hasIngestionData(normalized)) {
    return {
      latest: normalized,
      history: [],
    } satisfies LoadedIngestionMetadataState;
  }

  return {
    latest: normalized,
    history: [normalized],
  } satisfies LoadedIngestionMetadataState;
}

function isHistoryFile(value: unknown): value is SnapshotIngestionMetadataHistoryFile {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Array.isArray((value as SnapshotIngestionMetadataHistoryFile).history);
}

function createEmptyIngestionMetadata(): SnapshotIngestionMetadata {
  return {
    schemaVersion: SNAPSHOT_INGESTION_SCHEMA_VERSION,
    entryHashes: {},
  } satisfies SnapshotIngestionMetadata;
}

function createEmptyIngestionState(): LoadedIngestionMetadataState {
  const empty = createEmptyIngestionMetadata();
  return {
    latest: empty,
    history: [],
  } satisfies LoadedIngestionMetadataState;
}

function hasIngestionData(metadata: SnapshotIngestionMetadata): boolean {
  const hashCount = Object.keys(metadata.entryHashes ?? {}).length;
  return hashCount > 0 || Boolean(metadata.groupId) || Boolean(metadata.ingestedAt);
}

function buildEntryHashMap(entries: SnapshotEntry[]): SnapshotFileHashes {
  return entries.reduce<SnapshotFileHashes>((acc, entry) => {
    acc[entry.relativePath] = entry.hash;
    return acc;
  }, {});
}

function determineChangedEntries(
  entries: SnapshotEntry[],
  previousHashes: SnapshotFileHashes = {},
): SnapshotEntry[] {
  return entries.filter((entry) => previousHashes[entry.relativePath] !== entry.hash);
}

function summarizeEntryChanges(
  entries: SnapshotEntry[],
  previousHashes: SnapshotFileHashes = {},
): EntryChangeSummary {
  return entries.reduce<EntryChangeSummary>(
    (acc, entry) => {
      if (previousHashes[entry.relativePath]) {
        acc.updatedEntries += 1;
      } else {
        acc.newEntries += 1;
      }
      return acc;
    },
    { newEntries: 0, updatedEntries: 0 },
  );
}

interface HydrationActionArgs {
  snapshotEntries: SnapshotEntry[];
  changedEntries: SnapshotEntry[];
  previousMetadata: SnapshotIngestionMetadata;
  nextMetadata: SnapshotIngestionMetadata;
  options: HydrationOptions;
  dependencies: HydrationDependencies;
  groupId: string;
  changeSummary: EntryChangeSummary;
}

async function executeHydrationActions(
  args: HydrationActionArgs,
): Promise<{ events: EventRecord[]; insights: InsightRecord[] }> {
  const {
    snapshotEntries,
    changedEntries,
    previousMetadata,
    nextMetadata,
    options,
    dependencies,
    groupId,
    changeSummary,
  } = args;
  const events: EventRecord[] = [];
  const insights: InsightRecord[] = [];
  const { memoryClient } = dependencies;

  const briefingEvent = await memoryClient.logEvent({
    group_id: groupId,
    event_type: SESSION_BRIEFING_EVENT,
    agent_id: HYDRATION_AGENT_ID,
    workflow_id: HYDRATION_WORKFLOW_ID,
    metadata: buildBriefingMetadata(
      snapshotEntries,
      changedEntries,
      nextMetadata,
      options,
      changeSummary,
    ),
    status: "pending",
  });
  events.push(briefingEvent);

  const ingestionResults = await processEntriesConcurrently(changedEntries, options.concurrency, (entry) =>
    ingestSnapshotEntry({
      entry,
      groupId,
      parentEventId: briefingEvent.id,
      previousMetadata,
      memoryClient,
    }),
  );

  for (const result of ingestionResults) {
    events.push(result.event);
    insights.push(result.insight);
  }

  const completionEvent = await memoryClient.logEvent({
    group_id: groupId,
    event_type: SESSION_BRIEFING_COMPLETED_EVENT,
    agent_id: HYDRATION_AGENT_ID,
    workflow_id: HYDRATION_WORKFLOW_ID,
    parent_event_id: briefingEvent.id,
    metadata: buildCompletionMetadata(
      snapshotEntries,
      changedEntries,
      nextMetadata,
      options,
      changeSummary,
    ),
    status: "completed",
  });
  events.push(completionEvent);

  return { events, insights };
}

interface IngestSnapshotEntryArgs {
  entry: SnapshotEntry;
  groupId: string;
  previousMetadata: SnapshotIngestionMetadata;
  memoryClient: MemoryClient;
  parentEventId?: number;
}

async function ingestSnapshotEntry(
  args: IngestSnapshotEntryArgs,
): Promise<{ insight: InsightRecord; event: EventRecord }> {
  const { entry, groupId, previousMetadata, memoryClient, parentEventId } = args;
  const changeType = previousMetadata.entryHashes[entry.relativePath] ? "updated" : "new";
  const insightId = buildInsightId(groupId, entry.relativePath);
  const metadata = buildInsightMetadata(entry);
  const content = buildInsightContent(entry);
  const confidence = deriveConfidence(entry.priority);

  let insight: InsightRecord;
  if (changeType === "new") {
    insight = await memoryClient.createInsight({
      insight_id: insightId,
      group_id: groupId,
      content,
      confidence,
      topic_key: entry.tags.length > 0 ? `snapshot.${entry.tags[0].toLowerCase()}` : "snapshot.general",
      metadata,
    });
  } else {
    try {
      insight = await memoryClient.createInsightVersion(
        insightId,
        content,
        confidence,
        groupId,
        metadata,
      );
    } catch (error) {
      if (error instanceof InsightValidationError) {
        insight = await memoryClient.createInsight({
          insight_id: insightId,
          group_id: groupId,
          content,
          confidence,
          topic_key: entry.tags.length > 0 ? `snapshot.${entry.tags[0].toLowerCase()}` : "snapshot.general",
          metadata,
        });
      } else {
        throw error;
      }
    }
  }

  const event = await memoryClient.logEvent({
    group_id: groupId,
    event_type: ENTRY_EVENT_TYPE,
    agent_id: HYDRATION_AGENT_ID,
    workflow_id: HYDRATION_WORKFLOW_ID,
    parent_event_id: parentEventId,
    metadata: {
      relativePath: entry.relativePath,
      hash: entry.hash,
      changeType,
      insightId,
      insightVersion: insight.version,
      priority: entry.priority,
      title: entry.title,
    },
    status: "completed",
  });

  return { insight, event };
}

function buildBriefingMetadata(
  snapshotEntries: SnapshotEntry[],
  changedEntries: SnapshotEntry[],
  metadata: SnapshotIngestionMetadata,
  options: HydrationOptions,
  summary: EntryChangeSummary,
): Record<string, unknown> {
  return {
    snapshotPath: options.snapshotPath,
    ingestionMetadataPath: options.ingestionMetadataPath,
    totalEntries: snapshotEntries.length,
    changedEntries: changedEntries.length,
    newEntries: summary.newEntries,
    updatedEntries: summary.updatedEntries,
    changedPaths: changedEntries.slice(0, 10).map((entry) => entry.relativePath),
    ingestedAt: metadata.ingestedAt,
    topDocs: pickTopDocs(snapshotEntries),
  };
}

function buildCompletionMetadata(
  snapshotEntries: SnapshotEntry[],
  changedEntries: SnapshotEntry[],
  metadata: SnapshotIngestionMetadata,
  options: HydrationOptions,
  summary: EntryChangeSummary,
): Record<string, unknown> {
  return {
    snapshotPath: options.snapshotPath,
    ingestionMetadataPath: options.ingestionMetadataPath,
    ingestedAt: metadata.ingestedAt,
    ingestedEntries: changedEntries.length,
    newEntries: summary.newEntries,
    updatedEntries: summary.updatedEntries,
    totalEntries: snapshotEntries.length,
    skippedEntries: snapshotEntries.length - changedEntries.length,
    entryHashes: metadata.entryHashes,
  };
}

function assertPathWithinDirectory(targetPath: string, directoryPath: string): void {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedDirectory = path.resolve(directoryPath);
  const relative = path.relative(normalizedDirectory, normalizedTarget);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new HydrationError(
      `Snapshot path must reside inside the memory bank directory (${normalizedDirectory}).`,
      "CONFIG",
    );
  }
}

function validateSnapshotEntries(entries: unknown[], snapshotPath: string): SnapshotEntry[] {
  return entries.map((entry, index) => validateSnapshotEntry(entry, index, snapshotPath));
}

function validateSnapshotEntry(entry: unknown, index: number, snapshotPath: string): SnapshotEntry {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} in ${snapshotPath} is not an object.`,
      "CONFIG",
    );
  }

  const record = entry as Record<string, unknown>;
  const pathValue = requireString(record.path, "path", index, snapshotPath);
  const relativePathValue = requireString(record.relativePath, "relativePath", index, snapshotPath);
  const normalizedPath = normalizeSnapshotRelativePath(pathValue, index, snapshotPath, "path");
  const normalizedRelativePath = normalizeSnapshotRelativePath(
    relativePathValue,
    index,
    snapshotPath,
    "relativePath",
  );

  if (normalizedPath !== normalizedRelativePath) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} has mismatched path and relativePath values.`,
      "CONFIG",
    );
  }

  const title = requireString(record.title, "title", index, snapshotPath);
  const summary = requireString(record.summary, "summary", index, snapshotPath);
  const lastModified = requireString(record.lastModified, "lastModified", index, snapshotPath);
  const hash = requireString(record.hash, "hash", index, snapshotPath);
  const priority = requireNumber(record.priority, "priority", index, snapshotPath);
  const tags = requireStringArray(record.tags, "tags", index, snapshotPath);

  if (hash && !hash.startsWith("sha256:")) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} has invalid hash format (expected sha256:*).`,
      "CONFIG",
    );
  }

  if (Number.isNaN(Date.parse(lastModified))) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} has invalid lastModified timestamp.`,
      "CONFIG",
    );
  }

  return {
    path: normalizedPath,
    relativePath: normalizedRelativePath,
    title,
    summary,
    tags,
    lastModified,
    hash,
    priority,
  } satisfies SnapshotEntry;
}

function requireString(
  value: unknown,
  field: string,
  index: number,
  snapshotPath: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} in ${snapshotPath} is missing a valid ${field}.`,
      "CONFIG",
    );
  }
  return value;
}

function requireNumber(
  value: unknown,
  field: string,
  index: number,
  snapshotPath: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} in ${snapshotPath} is missing a valid ${field}.`,
      "CONFIG",
    );
  }
  return value;
}

function requireStringArray(
  value: unknown,
  field: string,
  index: number,
  snapshotPath: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} in ${snapshotPath} is missing a valid ${field} array.`,
      "CONFIG",
    );
  }
  for (const item of value) {
    if (typeof item !== "string") {
      throw new HydrationError(
        `Snapshot entry #${index + 1} in ${snapshotPath} contains non-string ${field} values.`,
        "CONFIG",
      );
    }
  }
  return value as string[];
}

function normalizeSnapshotRelativePath(
  value: string,
  index: number,
  snapshotPath: string,
  field: string,
): string {
  if (path.isAbsolute(value)) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} in ${snapshotPath} has an absolute ${field}, which is not allowed.`,
      "CONFIG",
    );
  }
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} in ${snapshotPath} has an unsafe ${field} containing '..'.`,
      "CONFIG",
    );
  }
  if (segments.some((segment) => segment.length === 0)) {
    throw new HydrationError(
      `Snapshot entry #${index + 1} in ${snapshotPath} has an invalid ${field} with empty path segments.`,
      "CONFIG",
    );
  }
  return normalized;
}

async function processEntriesConcurrently<T>(
  entries: SnapshotEntry[],
  concurrency: number,
  processor: (entry: SnapshotEntry, index: number) => Promise<T>,
): Promise<T[]> {
  if (entries.length === 0) {
    return [];
  }
  const limit = Math.max(1, Math.floor(concurrency));
  const results: T[] = new Array(entries.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, entries.length) }, async () => {
    while (nextIndex < entries.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await processor(entries[currentIndex]!, currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function pickTopDocs(entries: SnapshotEntry[], limit = 5): string[] {
  return [...entries]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((entry) => entry.relativePath);
}

function buildInsightId(groupId: string, relativePath: string): string {
  const sanitizedParts = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.replace(/\.[^/.]+$/, ""))
    .map((segment) => segment.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean);
  const normalized = sanitizedParts.join(".") || "entry";
  return `${groupId}.snapshot.${normalized}`.toLowerCase();
}

function buildInsightMetadata(entry: SnapshotEntry): Record<string, unknown> {
  return {
    path: entry.relativePath,
    title: entry.title,
    tags: entry.tags,
    lastModified: entry.lastModified,
    hash: entry.hash,
    priority: entry.priority,
  };
}

function buildInsightContent(entry: SnapshotEntry): string {
  return `${entry.title}\n\n${entry.summary}\n\nSource: ${entry.relativePath}`;
}

function deriveConfidence(priority: number): number {
  const normalized = Math.max(0, Math.min(100, priority));
  const confidence = 0.6 + normalized / 200;
  return Number(Math.min(confidence, 0.95).toFixed(2));
}

function logSummary(result: HydrationRunResult, dryRun: boolean): void {
  const changedCount = result.changedEntries.length;
  const totalCount = result.snapshotEntries.length;
  console.log(`Hydration complete: ${changedCount} of ${totalCount} entries changed.`);
  if (result.loggedEvents.length > 0 || result.ingestedInsights.length > 0) {
    console.log(
      `Logged ${result.loggedEvents.length} events and ${result.ingestedInsights.length} insight versions.`,
    );
  }
  if (dryRun) {
    console.log("[DRY RUN] Skipped writing ingestion metadata update.");
    return;
  }
  console.log(`Ingestion metadata written to ${result.options.ingestionMetadataPath}`);
}

if (import.meta.main) {
  runHydrationCli().catch((error) => {
    if (error instanceof HydrationError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
}
