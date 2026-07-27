import { getConnections } from "./canonical-tools/connection";
import { isRuVectorEnabled, getRuVectorPool } from "@/lib/ruvector/connection";
import { warmupEmbedding } from "@/lib/ruvector/embedding-service";
import { resetBudgetState } from "./canonical-tools/budget-circuit";
import { resolveAndValidateStartupTenant } from "@/lib/config/tenant-validator";

export interface MemoryServerBootstrapDeps {
  resetBudgetStateFn?: () => void;
  warmConnectionsFn?: () => Promise<void>;
  warmEmbeddingFn?: () => Promise<boolean>;
  /**
   * Story 22.3: Tenant validation function. Defaults to
   * resolveAndValidateStartupTenant which checks DEFAULT_GROUP_ID against
   * the tenants table. Pass a custom fn for testing.
   */
  validateTenantFn?: () => Promise<{ groupId: string; warning?: string }>;
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
  const validateTenant = deps.validateTenantFn ?? resolveAndValidateStartupTenant;

  reset();

  // Warm connections first — tenant validation needs the DB pool ready
  await Promise.allSettled([warmConn(), warmEmbed()]);

  // Story 22.3: Validate DEFAULT_GROUP_ID against the tenants table.
  // Runs after DB connection is established but before MCP tool registration.
  // Fails closed (throws) if the tenant is not registered or inactive.
  await validateTenant();
}
