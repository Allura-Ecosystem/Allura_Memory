/** A provisioned-endpoint example using the public @allura/sdk package. */
import {
  AlluraClient,
  type AlluraClientConfig,
  GroupIdSchema,
  type MemoryAddParams,
  type MemoryAddResponse,
  type MemorySearchParams,
  type MemorySearchResponse,
} from "@allura/sdk";

type Stage = "configuration" | "save" | "retrieve";

export class QuickstartFailure extends Error {
  constructor(
    public readonly stage: Stage,
    public readonly runId: string,
    public readonly savedMemoryId?: string,
  ) {
    super("QUICKSTART_FAILED");
  }
}

interface QuickstartClient {
  memory: {
    add(params: MemoryAddParams): Promise<MemoryAddResponse>;
    search(params: MemorySearchParams): Promise<MemorySearchResponse>;
  };
  disconnect(): Promise<void>;
}

interface QuickstartConfig {
  baseUrl: string;
  authToken: string;
  groupId: string;
}

export async function runQuickstart(
  input: QuickstartConfig,
  makeClient: (config: AlluraClientConfig) => QuickstartClient = (config) => new AlluraClient(config),
): Promise<Record<string, unknown>> {
  const runId = crypto.randomUUID();
  let stage: Stage = "configuration";
  let savedMemoryId: string | undefined;
  try {
    if (!input.baseUrl || !input.authToken || !GroupIdSchema.safeParse(input.groupId).success) {
      throw new Error("MISSING_CONFIGURATION");
    }
    const config = { baseUrl: input.baseUrl, authToken: input.authToken, retries: 0 };
    const decision = `Decision: We chose PostgreSQL because our team needs relational queries and an inspectable decision history. Example run: ${runId}.`;
    stage = "save";
    const firstSession = makeClient(config);
    let saved: MemoryAddResponse;
    try {
      saved = await firstSession.memory.add({
        group_id: input.groupId, content: decision,
        metadata: { source: "manual", conversation_id: runId },
      });
      savedMemoryId = saved.id;
    } finally {
      await firstSession.disconnect();
    }

    // A new client initializes a new MCP session. No automatic retry of the save.
    stage = "retrieve";
    const nextSession = makeClient(config);
    try {
      const found = await nextSession.memory.search({
        group_id: input.groupId, query: decision, status: "all", include_global: false, limit: 10,
      });
      const exact = found.results.find((record) => record.id === saved.id && record.content === decision);
      if (!exact) throw new Error("EXACT_SAVED_RECORD_NOT_RETRIEVED");
      return {
        status: "passed", run_id: runId, saved_memory_id: saved.id,
        pending_review_at_save: saved.pending_review ?? "not_reported",
        source: exact.source, provenance: exact.provenance,
        approval_status: "not_verified_by_this_example",
      };
    } finally {
      await nextSession.disconnect();
    }
  } catch {
    // Retain reconciliation locators, never backend text or credentials.
    throw new QuickstartFailure(stage, runId, savedMemoryId);
  }
}

export async function quickstartMain(args = process.argv.slice(2)): Promise<number> {
  try {
    if (!args.includes('--allow-write')) {
      throw new QuickstartFailure("configuration", crypto.randomUUID());
    }
    const receipt = await runQuickstart({
      baseUrl: process.env.ALLURA_BASE_URL ?? '',
      authToken: process.env.ALLURA_AUTH_TOKEN ?? '',
      groupId: process.env.ALLURA_GROUP_ID ?? '',
    });
    console.log(JSON.stringify(receipt, null, 2));
    return 0;
  } catch (error) {
    const failure = error instanceof QuickstartFailure ? error : undefined;
    console.error(JSON.stringify({
      status: "failed", code: "QUICKSTART_FAILED",
      stage: failure?.stage ?? "configuration",
      run_id: failure?.runId ?? null,
      saved_memory_id: failure?.savedMemoryId ?? null,
      save_may_have_committed: failure?.stage === "save" || Boolean(failure?.savedMemoryId),
      next_action: "Use the run ID or saved memory ID to reconcile through the authorized service before rerunning. No automatic write retry was performed.",
    }, null, 2));
    return 1;
  }
}

if (import.meta.main) {
  quickstartMain().then((code) => { process.exitCode = code; });
}
