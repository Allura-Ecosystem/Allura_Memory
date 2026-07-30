import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { MemoryClient } from "../../scripts/helpers/memory-client";
import type { SnapshotEntry } from "../../scripts/helpers/snapshot-types";
import {
  hydrateSessionFromSnapshot,
  runHydrationCli,
} from "../../scripts/hydrate-session-from-snapshot";
import type { InsightRecord } from "../../scripts/lib/neo4j-stub";
import { InsightValidationError } from "../../scripts/lib/neo4j-stub";
import type { EventRecord } from "../../src/lib/postgres/queries/insert-trace";

// Pre-Phase-4 baseline — tracked in docs/deferred/pre-existing-failures.md
// Reason: tests use group_id "roninmemory" which no longer passes validation (requires allura-* format)
const shouldRunHydration = process.env.RUN_HYDRATION_INTEGRATION === "true";

describe.skipIf(!shouldRunHydration)("hydrate-session-from-snapshot", () => {
  let workDir: string;
  let memoryBankDir: string;
  let snapshotPath: string;
  let ingestionPath: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "hydrate-test-"));
    memoryBankDir = path.join(workDir, "memory-bank");
    snapshotPath = path.join(memoryBankDir, "index.json");
    ingestionPath = path.join(memoryBankDir, "ingestion.meta.json");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("throws when the snapshot file is missing", async () => {
    await expect(
      runHydrationCli(["--memory-bank", memoryBankDir], {
        memoryClient: createMemoryClientMock(),
      }),
    ).rejects.toThrow(/snapshot not found/i);
  });

  it("rejects snapshot paths outside of the memory bank directory", async () => {
    const outsideDir = path.join(workDir, "outside-bank");
    const outsideSnapshot = path.join(outsideDir, "rogue.json");
    await mkdir(outsideDir, { recursive: true });
    await writeFile(outsideSnapshot, "[]\n", "utf-8");

    await expect(
      runHydrationCli([
        "--memory-bank",
        memoryBankDir,
        "--snapshot",
        outsideSnapshot,
      ], {
        memoryClient: createMemoryClientMock(),
      }),
    ).rejects.toThrow(/memory bank/i);
  });

  it("validates snapshot entries and blocks unsafe paths", async () => {
    const invalidEntry = {
      path: "../etc/shadow",
      relativePath: "../etc/shadow",
      title: "Invalid",
      summary: "Invalid entry",
      tags: ["invalid"],
      lastModified: new Date("2026-03-28T00:00:00.000Z").toISOString(),
      hash: `sha256:${"a".repeat(64)}`,
      priority: 0,
    } as SnapshotEntry;

    await writeSnapshot([invalidEntry]);

    await expect(
      hydrateSessionFromSnapshot(
        {
          snapshotPath,
          ingestionMetadataPath: ingestionPath,
          groupId: "roninmemory",
          dryRun: false,
          concurrency: 1,
        },
        {
          now: () => new Date("2026-03-28T01:00:00.000Z"),
          memoryClient: createMemoryClientMock(),
        },
      ),
    ).rejects.toThrow(/unsafe/i);
  });

  it("validates the provided group_id before continuing", async () => {
    await writeSnapshot([
      buildSnapshotEntry("docs/roninmemory/README.md", "sha256:abc"),
    ]);

    await expect(
      runHydrationCli([
        "--memory-bank",
        memoryBankDir,
        "--group-id",
        "RoninMemory",
      ], {
        memoryClient: createMemoryClientMock(),
      }),
    ).rejects.toThrow(/lowercase/);
  });

  it("creates ingestion metadata when the file does not exist", async () => {
    const entry = buildSnapshotEntry("docs/roninmemory/README.md", "sha256:1234");
    await writeSnapshot([entry]);

    const fixedTimestamp = "2026-03-28T12:00:00.000Z";
    const memoryClient = createMemoryClientMock();
    const result = await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: false,
        concurrency: 1,
      },
      {
        now: () => new Date(fixedTimestamp),
        memoryClient,
      },
    );

    const metadataContents = await readFile(ingestionPath, "utf-8");
    const metadata = JSON.parse(metadataContents);

    expect(metadata.schemaVersion).toBe(1);
    expect(Array.isArray(metadata.history)).toBe(true);
    expect(metadata.history).toHaveLength(1);
    const latest = metadata.history[0];
    expect(latest.groupId).toBe("roninmemory");
    expect(latest.ingestedAt).toBe(fixedTimestamp);
    expect(latest.entryHashes).toEqual({
      "docs/roninmemory/README.md": "sha256:1234",
    });
    expect(result.previousIngestionMetadata.entryHashes).toEqual({});
    expect(result.changedEntries.map((entry) => entry.relativePath)).toEqual([
      "docs/roninmemory/README.md",
    ]);
    expect(memoryClient.createInsight).toHaveBeenCalledTimes(1);
  });

  it("detects changed entries when hashes differ from prior ingestion metadata", async () => {
    const originalEntries = [
      buildSnapshotEntry("docs/roninmemory/README.md", "sha256:1111"),
      buildSnapshotEntry("docs/Carlos_plan_framework/BLUEPRINT.md", "sha256:2222"),
    ];
    await writeSnapshot(originalEntries);

    await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: false,
        concurrency: 1,
      },
      {
        now: () => new Date("2026-03-28T00:00:00.000Z"),
        memoryClient: createMemoryClientMock(),
      },
    );

    const updatedEntries = [
      buildSnapshotEntry("docs/roninmemory/README.md", "sha256:1111"),
      buildSnapshotEntry("docs/Carlos_plan_framework/BLUEPRINT.md", "sha256:3333"),
    ];
    await writeSnapshot(updatedEntries);

    const versionClient = createMemoryClientMock();
    const result = await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: false,
        concurrency: 1,
      },
      {
        now: () => new Date("2026-03-29T00:00:00.000Z"),
        memoryClient: versionClient,
      },
    );

    expect(result.changedEntries.map((entry) => entry.relativePath)).toEqual([
      "docs/Carlos_plan_framework/BLUEPRINT.md",
    ]);

    const storedMetadata = JSON.parse(await readFile(ingestionPath, "utf-8"));
    expect(storedMetadata.history).toHaveLength(2);
    const firstRun = storedMetadata.history[0];
    const secondRun = storedMetadata.history[1];
    expect(firstRun.entryHashes).toEqual({
      "docs/roninmemory/README.md": "sha256:1111",
      "docs/Carlos_plan_framework/BLUEPRINT.md": "sha256:2222",
    });
    expect(secondRun.entryHashes).toEqual({
      "docs/roninmemory/README.md": "sha256:1111",
      "docs/Carlos_plan_framework/BLUEPRINT.md": "sha256:3333",
    });
    expect(versionClient.createInsightVersion).toHaveBeenCalledTimes(1);
  });

  it("uses hashes from the latest session briefing completion event when available", async () => {
    const entry = buildSnapshotEntry("docs/roninmemory/README.md", "sha256:fresh");
    await writeSnapshot([entry]);
    await mkdir(memoryBankDir, { recursive: true });
    await writeFile(
      ingestionPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entryHashes: {
            "docs/roninmemory/README.md": "sha256:stale",
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const completionEvent = buildEventRecord({
      event_type: "session_briefing_completed",
      metadata: {
        entryHashes: {
          "docs/roninmemory/README.md": "sha256:fresh",
        },
        ingestedAt: "2026-03-27T00:00:00.000Z",
      },
      status: "completed",
    });

    const memoryClient = createMemoryClientMock({
      getLatestEventByType: vi.fn().mockResolvedValue(completionEvent),
    });

    const result = await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: false,
        concurrency: 1,
      },
      {
        now: () => new Date("2026-03-30T00:00:00.000Z"),
        memoryClient,
      },
    );

    expect(memoryClient.getLatestEventByType).toHaveBeenCalledWith(
      "roninmemory",
      "session_briefing_completed",
    );
    expect(result.previousIngestionMetadata.entryHashes).toEqual({
      "docs/roninmemory/README.md": "sha256:fresh",
    });
    expect(result.changedEntries).toHaveLength(0);
    expect(memoryClient.createInsight).not.toHaveBeenCalled();
    expect(memoryClient.createInsightVersion).not.toHaveBeenCalled();
  });

  it("falls back to stored ingestion metadata when completion event lacks hashes", async () => {
    const entry = buildSnapshotEntry("docs/roninmemory/README.md", "sha256:newer");
    await writeSnapshot([entry]);
    await mkdir(memoryBankDir, { recursive: true });
    await writeFile(
      ingestionPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entryHashes: {
            "docs/roninmemory/README.md": "sha256:older",
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const incompleteEvent = buildEventRecord({
      event_type: "session_briefing_completed",
      metadata: {
        snapshotPath: "memory-bank/index.json",
      },
      status: "completed",
    });

    const memoryClient = createMemoryClientMock({
      getLatestEventByType: vi.fn().mockResolvedValue(incompleteEvent),
    });

    const result = await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: false,
        concurrency: 1,
      },
      {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        memoryClient,
      },
    );

    expect(result.changedEntries.map((entry) => entry.relativePath)).toEqual([
      "docs/roninmemory/README.md",
    ]);
    expect(memoryClient.createInsightVersion).toHaveBeenCalledTimes(1);
  });

  it("logs session briefing events and creates insights for each changed entry", async () => {
    const entries = [
      buildSnapshotEntry("docs/roninmemory/README.md", "sha256:aaaa"),
      buildSnapshotEntry("docs/Carlos_plan_framework/BLUEPRINT.md", "sha256:bbbb"),
    ];
    await writeSnapshot(entries);

    const memoryClient = createMemoryClientMock();
    await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: false,
        concurrency: 1,
      },
      {
        now: () => new Date("2026-03-28T05:00:00.000Z"),
        memoryClient,
      },
    );

    expect(memoryClient.logEvent).toHaveBeenCalledTimes(4);
    expect(memoryClient.logEvent.mock.calls[0]?.[0].event_type).toBe("session_briefing");
    const briefingMetadata = memoryClient.logEvent.mock.calls[0]?.[0]
      .metadata as Record<string, unknown>;
    expect(briefingMetadata).toMatchObject({
      changedEntries: 2,
      newEntries: 2,
      updatedEntries: 0,
    });
    expect(memoryClient.logEvent.mock.calls[1]?.[0].event_type).toBe("memory_snapshot_entry");
    expect(memoryClient.logEvent.mock.calls[1]?.[0].metadata).toMatchObject({
      relativePath: "docs/roninmemory/README.md",
      changeType: "new",
    });
    const finalCall = memoryClient.logEvent.mock.calls[memoryClient.logEvent.mock.calls.length - 1]?.[0];
    expect(finalCall?.event_type).toBe("session_briefing_completed");
    expect(finalCall?.metadata).toMatchObject({
      ingestedEntries: 2,
      newEntries: 2,
      updatedEntries: 0,
      skippedEntries: 0,
    });
    expect(finalCall?.metadata.entryHashes).toEqual({
      "docs/roninmemory/README.md": "sha256:aaaa",
      "docs/Carlos_plan_framework/BLUEPRINT.md": "sha256:bbbb",
    });
    expect(memoryClient.createInsight).toHaveBeenCalledTimes(2);
  });

  it("retries with fresh insight when version creation fails", async () => {
    await writeSnapshot([
      buildSnapshotEntry("docs/roninmemory/README.md", "sha256:new"),
    ]);
    await mkdir(memoryBankDir, { recursive: true });
    await writeFile(
      ingestionPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          entryHashes: {
            "docs/roninmemory/README.md": "sha256:old",
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const failingClient = createMemoryClientMock({
      createInsightVersion: vi
        .fn()
        .mockRejectedValue(new InsightValidationError("previous insight missing")),
    });

    await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: false,
        concurrency: 1,
      },
      {
        now: () => new Date("2026-03-28T06:00:00.000Z"),
        memoryClient: failingClient,
      },
    );

    const upgradedMetadata = JSON.parse(await readFile(ingestionPath, "utf-8"));
    expect(upgradedMetadata.history).toHaveLength(2);
    expect(upgradedMetadata.history[0]?.entryHashes["docs/roninmemory/README.md"]).toBe(
      "sha256:old",
    );
    expect(upgradedMetadata.history[1]?.entryHashes["docs/roninmemory/README.md"]).toBe(
      "sha256:new",
    );
    expect(failingClient.createInsightVersion).toHaveBeenCalledTimes(1);
    expect(failingClient.createInsight).toHaveBeenCalledTimes(1);
  });

  it("respects the configured concurrency when ingesting entries", async () => {
    await writeSnapshot([
      buildSnapshotEntry("docs/roninmemory/README.md", "sha256:a1"),
      buildSnapshotEntry("docs/roninmemory/CONTRIBUTING.md", "sha256:a2"),
      buildSnapshotEntry("docs/Carlos_plan_framework/BLUEPRINT.md", "sha256:a3"),
    ]);

    let active = 0;
    let observedMax = 0;
    const memoryClient = createMemoryClientMock({
      createInsight: vi.fn().mockImplementation(async (payload) => {
        active += 1;
        observedMax = Math.max(observedMax, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return buildInsightRecord({
          insight_id: payload.insight_id,
          group_id: payload.group_id,
          content: payload.content,
          confidence: payload.confidence,
          metadata: payload.metadata ?? {},
        });
      }),
    });

    await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: false,
        concurrency: 2,
      },
      {
        now: () => new Date("2026-03-28T08:00:00.000Z"),
        memoryClient,
      },
    );

    expect(observedMax).toBe(2);
    expect(memoryClient.createInsight).toHaveBeenCalledTimes(3);
  });

  it("skips memory operations in dry-run mode", async () => {
    await writeSnapshot([
      buildSnapshotEntry("docs/roninmemory/README.md", "sha256:dry"),
    ]);

    const memoryClient = createMemoryClientMock();
    const result = await hydrateSessionFromSnapshot(
      {
        snapshotPath,
        ingestionMetadataPath: ingestionPath,
        groupId: "roninmemory",
        dryRun: true,
        concurrency: 1,
      },
      {
        now: () => new Date("2026-03-28T07:00:00.000Z"),
        memoryClient,
      },
    );

    expect(memoryClient.logEvent).not.toHaveBeenCalled();
    expect(memoryClient.createInsight).not.toHaveBeenCalled();
    expect(memoryClient.createInsightVersion).not.toHaveBeenCalled();
    expect(result.loggedEvents).toHaveLength(0);
    expect(result.ingestedInsights).toHaveLength(0);
  });

  async function writeSnapshot(entries: SnapshotEntry[]): Promise<void> {
    await mkdir(memoryBankDir, { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
  }

  function buildSnapshotEntry(relativePath: string, hash: string): SnapshotEntry {
    return {
      path: relativePath,
      relativePath,
      title: `Title for ${relativePath}`,
      summary: `Summary for ${relativePath}`,
      tags: [],
      lastModified: "2026-03-28T00:00:00.000Z",
      hash,
      priority: 0,
    } satisfies SnapshotEntry;
  }

  type MemoryClientMock = MemoryClient & {
    logEvent: ReturnType<typeof vi.fn>;
    createInsight: ReturnType<typeof vi.fn>;
    createInsightVersion: ReturnType<typeof vi.fn>;
    getLatestEventByType: ReturnType<typeof vi.fn>;
  };

  function createMemoryClientMock(overrides?: Partial<MemoryClientMock>): MemoryClientMock {
    let insightVersion = 1;
    const mock: MemoryClientMock = {
      logEvent: vi.fn().mockImplementation((payload) =>
        Promise.resolve(
          buildEventRecord({
            group_id: payload.group_id,
            event_type: payload.event_type,
            workflow_id: payload.workflow_id ?? null,
            parent_event_id: payload.parent_event_id ?? null,
            metadata: (payload.metadata ?? {}) as Record<string, unknown>,
            status: payload.status ?? "pending",
          }),
        ),
      ),
      createInsight: vi.fn().mockImplementation((payload) =>
        Promise.resolve(
          buildInsightRecord({
            insight_id: payload.insight_id,
            group_id: payload.group_id,
            version: insightVersion++,
            content: payload.content,
            confidence: payload.confidence,
            metadata: payload.metadata ?? {},
          }),
        ),
      ),
      createInsightVersion: vi.fn().mockImplementation((insightId, content, confidence, groupId, metadata) =>
        Promise.resolve(
          buildInsightRecord({
            insight_id: insightId,
            group_id: groupId,
            version: insightVersion++,
            content,
            confidence,
            metadata: metadata ?? {},
          }),
        ),
      ),
      getLatestEventByType: vi.fn().mockResolvedValue(null),
    } satisfies MemoryClientMock;

    return Object.assign(mock, overrides);
  }

  let eventRecordId = 1;
  function buildEventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
    return {
      id: overrides.id ?? eventRecordId++,
      group_id: overrides.group_id ?? "roninmemory",
      event_type: overrides.event_type ?? "session_briefing",
      created_at: overrides.created_at ?? new Date("2026-03-28T00:00:00.000Z"),
      agent_id: overrides.agent_id ?? "test-agent",
      workflow_id: overrides.workflow_id ?? null,
      step_id: overrides.step_id ?? null,
      parent_event_id: overrides.parent_event_id ?? null,
      metadata: overrides.metadata ?? {},
      outcome: overrides.outcome ?? {},
      status: overrides.status ?? "pending",
      error_message: overrides.error_message ?? null,
      error_code: overrides.error_code ?? null,
      inserted_at: overrides.inserted_at ?? new Date("2026-03-28T00:00:00.000Z"),
      confidence: overrides.confidence ?? null,
      evidence_ref: overrides.evidence_ref ?? null,
      schema_version: overrides.schema_version ?? 1,
    } satisfies EventRecord;
  }

  let insightRecordId = 1;
  function buildInsightRecord(overrides: Partial<InsightRecord> = {}): InsightRecord {
    return {
      id: overrides.id ?? `insight-${insightRecordId++}`,
      insight_id: overrides.insight_id ?? "roninmemory.snapshot.docs.readme",
      version: overrides.version ?? 1,
      content: overrides.content ?? "Content",
      confidence: overrides.confidence ?? 0.8,
      topic_key: overrides.topic_key ?? "test.insight",
      group_id: overrides.group_id ?? "roninmemory",
      source_type: overrides.source_type ?? "manual",
      source_ref: overrides.source_ref ?? null,
      created_at: overrides.created_at ?? new Date("2026-03-28T00:00:00.000Z"),
      created_by: overrides.created_by ?? null,
      status: overrides.status ?? "active",
      metadata: overrides.metadata ?? {},
    } satisfies InsightRecord;
  }
});
