import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import type { MemoryAddParams } from "@allura/sdk";

import { FirstUseFailure, firstUseMain, type FirstUseSession, runFirstUse, validateFirstUseConfig } from "../../scripts/first-use-memory";
import { QuickstartFailure, runQuickstart } from "../../examples/quickstart/index";

const config = { baseUrl: "http://localhost:6477", groupId: "allura-test", token: "test-only-token" };
const payload = (value: unknown): unknown => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

function harness(options: { mismatch?: boolean; wrongContent?: boolean; sameSession?: boolean; rejectSave?: boolean; noReviewState?: boolean } = {}) {
  const calls: Array<{ session: number; tool: string; args: Record<string, unknown> }> = [];
  const closes: number[] = [];
  let savedContent = '';
  let sessionCount = 0;
  const factory = vi.fn(async (): Promise<FirstUseSession> => {
    const number = ++sessionCount;
    return {
      sessionId: options.sameSession ? 'same-session' : `session-${number}`,
      close: async () => { closes.push(number); },
      callTool: async (tool, args) => {
        calls.push({ session: number, tool, args });
        if (tool === 'memory_add') {
          if (options.rejectSave) throw new Error('sensitive backend error test-only-token');
          savedContent = String(args.content);
          return payload({ id: 'saved-id', stored: 'episodic', score: 0.8,
            pending_review: options.noReviewState ? undefined : true, created_at: '2026-10-20T22:00:00Z' });
        }
        return payload({ results: [{ id: options.mismatch ? 'other-id' : 'saved-id', content: options.wrongContent ? 'different decision' : savedContent,
          score: 0.8, source: 'episodic', provenance: 'manual', created_at: '2026-10-20T22:00:00Z' }], count: 1, latency_ms: 5,
          meta: { contract_version: 'v1', degraded: true, stores_used: ['postgres'], stores_attempted: ['postgres'], warnings: ['backend diagnostic test-only-token'] } });
      },
    };
  });
  return { factory, calls, closes };
}

describe('first-use memory evaluation (offline protocol checks, not live persistence)', () => {
  it('rejects an output option used as its own filename without creating a file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'allura-first-use-invalid-output-'));
    const originalDirectory = process.cwd();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      process.chdir(directory);
      expect(await firstUseMain(['--output', '--allow-write'])).toBe(1);
      expect(await readdir(directory)).toEqual([]);
      expect(JSON.parse(String(stdout.mock.calls[0][0]))).toMatchObject({ stage: 'configuration', code: 'OUTPUT_PATH_REQUIRED', save_may_have_committed: false });
    } finally {
      process.chdir(originalDirectory);
      stdout.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses a separate session after closing the save session and verifies the exact record', async () => {
    const fixture = harness();
    const receipt = await runFirstUse(config, fixture.factory);
    expect(fixture.factory).toHaveBeenCalledTimes(2);
    expect(fixture.closes).toEqual([1, 2]);
    expect(fixture.calls.map((call) => [call.session, call.tool])).toEqual([[1, 'memory_add'], [2, 'memory_search']]);
    expect(fixture.calls[0].args).not.toHaveProperty('user_id');
    expect(fixture.calls[1].args).toMatchObject({ status: 'all', include_global: false, group_id: 'allura-test' });
    expect(receipt).toMatchObject({ status: 'passed', saved_memory_id: 'saved-id', separate_sessions: true,
      pending_review_at_save: true, retrieved_provenance: 'manual', approval_status: 'not_verified_by_this_check', human_review_exercised: false });
    expect(receipt).toMatchObject({ retrieval_health: { degraded: true, warning_count: 1 } });
    expect(JSON.stringify(receipt)).not.toContain(config.token);
  });

  it('does not substitute a similar search hit for the saved record', async () => {
    const fixture = harness({ mismatch: true });
    await expect(runFirstUse(config, fixture.factory)).rejects.toMatchObject({
      stage: 'retrieve', code: 'EXACT_SAVED_RECORD_NOT_RETRIEVED', savedMemoryId: 'saved-id',
    });
  });

  it('rejects reused sessions instead of reporting a later-session success', async () => {
    const fixture = harness({ sameSession: true });
    await expect(runFirstUse(config, fixture.factory)).rejects.toMatchObject({ code: 'SEPARATE_SESSION_NOT_ESTABLISHED' });
    expect(fixture.calls).toHaveLength(1);
  });

  it('rejects changed content even when the returned ID matches', async () => {
    const fixture = harness({ wrongContent: true });
    await expect(runFirstUse(config, fixture.factory)).rejects.toMatchObject({ code: 'EXACT_SAVED_RECORD_NOT_RETRIEVED' });
  });

  it('does not retry an uncertain save or expose the backend error', async () => {
    const fixture = harness({ rejectSave: true });
    const failure = await runFirstUse(config, fixture.factory).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FirstUseFailure);
    expect(String(failure)).not.toContain(config.token);
    expect((failure as FirstUseFailure).runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.factory).toHaveBeenCalledTimes(1);
    expect(fixture.closes).toEqual([1]);
  });

  it('keeps an omitted review signal unknown', async () => {
    const fixture = harness({ noReviewState: true });
    expect(await runFirstUse(config, fixture.factory)).toMatchObject({ pending_review_at_save: 'not_reported', approval_status: 'not_verified_by_this_check' });
  });

  it('rejects missing credentials and embedded URL credentials before connecting', async () => {
    const fixture = harness();
    await expect(runFirstUse({ ...config, token: '' }, fixture.factory)).rejects.toMatchObject({ code: 'MISSING_AUTH_TOKEN' });
    expect(() => validateFirstUseConfig({ ...config, baseUrl: 'http://user:secret@localhost:6477' })).toThrow(FirstUseFailure);
    expect(() => validateFirstUseConfig({ ...config, baseUrl: 'http://localhost:3201' })).toThrow(FirstUseFailure);
    expect(fixture.factory).not.toHaveBeenCalled();
  });
});

describe('public SDK quickstart failure reconciliation', () => {
  it('retains the submitted run locator when the save response is lost, with no retry or backend text', async () => {
    const attempts: MemoryAddParams[] = [];
    const factory = vi.fn(() => ({
      memory: {
        add: async (args: MemoryAddParams) => {
          attempts.push(args);
          throw new Error('backend error containing test-only-token');
        },
        search: async () => { throw new Error('must not search after an uncertain save'); },
      },
      disconnect: async () => undefined,
    }));
    const failure = await runQuickstart({ baseUrl: config.baseUrl, authToken: config.token, groupId: config.groupId }, factory)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QuickstartFailure);
    expect(failure).toMatchObject({ stage: 'save', savedMemoryId: undefined });
    expect((failure as QuickstartFailure).runId).toBe((attempts[0].metadata as Record<string, unknown>).conversation_id);
    expect(String(attempts[0].content)).toContain((failure as QuickstartFailure).runId);
    expect(JSON.stringify(failure)).not.toContain(config.token);
    expect(attempts).toHaveLength(1);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('retains the known saved ID and run locator when later-session retrieval fails', async () => {
    let runId: unknown;
    const factory = vi.fn(() => ({
      memory: {
        add: async (args: MemoryAddParams) => {
          runId = (args.metadata as Record<string, unknown>).conversation_id;
          return { id: 'known-saved-id', stored: 'episodic' as const, score: 0.8, created_at: '2026-10-20' };
        },
        search: async () => ({ results: [], count: 0, latency_ms: 1 }),
      },
      disconnect: async () => undefined,
    }));
    const failure = await runQuickstart({ baseUrl: config.baseUrl, authToken: config.token, groupId: config.groupId }, factory)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ stage: 'retrieve', runId, savedMemoryId: 'known-saved-id' });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
