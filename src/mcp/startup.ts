import { getConnections } from "./canonical-tools/connection";
import { isRuVectorEnabled, getRuVectorPool } from "@/lib/ruvector/connection";
import { warmupEmbedding } from "@/lib/ruvector/embedding-service";
import { resetBudgetState } from "./canonical-tools/budget-circuit";

export interface MemoryServerBootstrapDeps {
  resetBudgetStateFn?: () => void;
  warmConnectionsFn?: () => Promise<void>;
  warmEmbeddingFn?: () => Promise<boolean>;
}

async function warmConnections(): Promise<void> {
  try {
    const { pg, neo4j } = await getConnections();
    const tasks: Promise<unknown>[] = [
      pg.query("SELECT 1").catch(() => undefined),
    ];
    if (neo4j) {
      tasks.push(neo4j.verifyConnectivity().catch(() => undefined));
    }

    if (isRuVectorEnabled()) {
      tasks.push(getRuVectorPool().query("SELECT 1").catch(() => undefined));
    }

    await Promise.allSettled(tasks);
  } catch (error) {
    console.warn("[startup] connection warmup failed:", error);
  }
}

export async function bootstrapMemoryServer(deps: MemoryServerBootstrapDeps = {}): Promise<void> {
  const reset = deps.resetBudgetStateFn ?? resetBudgetState;
  const warmConn = deps.warmConnectionsFn ?? warmConnections;
  const warmEmbed = deps.warmEmbeddingFn ?? warmupEmbedding;

  reset();

  await Promise.allSettled([warmConn(), warmEmbed()]);
}
