import { Pool } from "pg";
import { env } from "process";

// Server-only guard: throw if imported in browser environment
if (typeof window !== "undefined") {
  throw new Error("PostgreSQL connection module can only be used server-side");
}

/**
 * PostgreSQL connection configuration
 * Built from environment variables with safe defaults
 */
export interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  max: number;
}

export interface ConnectionConfigOptions {
  /** Workspace-governed operations must use the restricted app role. */
  requireAppRole?: boolean;
  /** Explicit compatibility boundary for migration/admin tooling. */
  role?: "app" | "owner";
}

/**
 * Pool configuration for connection safety
 */
interface PoolConfig {
  maxConnections: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxConnections: parseInt(env.POSTGRES_POOL_MAX || "10", 10),
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds
};

// Long-lived process pools. Owner access remains separate from the restricted
// application role so workspace-governed writes cannot fall back to owner credentials.
let ownerPoolInstance: Pool | null = null;
let appPoolInstance: Pool | null = null;

/**
 * Get connection configuration from environment variables
 * Uses safe defaults matching docker-compose.yml setup
 */
export function getConnectionConfig(options: ConnectionConfigOptions = {}): ConnectionConfig {
  const password = env.POSTGRES_PASSWORD;

  if (!password) {
    throw new Error("POSTGRES_PASSWORD environment variable is required");
  }

  const appUser = env.POSTGRES_APP_USER;
  const appPassword = env.POSTGRES_APP_PASSWORD;
  const useAppRole = options.role === "app";

  if ((options.requireAppRole || options.role === "app") && (!appUser || !appPassword)) {
    throw new Error("POSTGRES_APP_USER and POSTGRES_APP_PASSWORD are required for workspace-governed services");
  }

  return {
    host: env.POSTGRES_HOST || "localhost",
    port: parseInt(env.POSTGRES_PORT || "5432", 10),
    database: env.POSTGRES_DB || "memory",
    user: useAppRole ? appUser! : env.POSTGRES_USER || "ronin4life",
    password: useAppRole ? appPassword! : password,
    connectionTimeoutMillis: DEFAULT_POOL_CONFIG.connectionTimeoutMillis,
    idleTimeoutMillis: DEFAULT_POOL_CONFIG.idleTimeoutMillis,
    max: DEFAULT_POOL_CONFIG.maxConnections,
  };
}

/**
 * Get or create the explicit owner/migration pool. Runtime code must use
 * getPool()/getAppPool(); this elevated boundary is intentionally named.
 */
export function getOwnerPool(): Pool {
  if (!ownerPoolInstance) {
    const config = getConnectionConfig({ role: "owner" });

    ownerPoolInstance = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      idleTimeoutMillis: config.idleTimeoutMillis,
      max: config.max,
    });

    ownerPoolInstance.on("error", (err: Error) => {
      console.error("[PostgreSQL Owner Pool] Unexpected error on idle client:", err.message);
    });
  }

  return ownerPoolInstance;
}

/**
 * Drop the cached app-pool singleton so the next getAppPool() call builds a
 * fresh pool. Callers must have ended the previous pool themselves (this does
 * not close anything). Without this, resetConnections()-style test hooks end
 * the shared pool while getAppPool() keeps handing back the dead instance.
 */
export function resetAppPoolSingleton(): void {
  appPoolInstance = null;
}

/**
 * Get or create the managed pool that connects as the restricted application
 * role. Workspace transactions share this process singleton rather than
 * creating one pool per write, and it is closed by closePool during shutdown.
 */
export function getAppPool(): Pool {
  if (!appPoolInstance) {
    const appConfig = getConnectionConfig({ requireAppRole: true, role: "app" });
    appPoolInstance = new Pool({ ...appConfig });

    appPoolInstance.on("error", (err: Error) => {
      console.error("[PostgreSQL App Pool] Unexpected error on idle client:", err.message);
    });
  }

  return appPoolInstance;
}

/**
 * Legacy/default runtime pool. Preserve the repository-wide owner-backed
 * behavior; workspace-governed boundaries must opt into getAppPool() through
 * withWorkspaceTransaction().
 */
export function getPool(): Pool {
  return getOwnerPool();
}

/**
 * Close the connection pool
 * Call this during graceful shutdown
 */
export async function closePool(): Promise<void> {
  const pools = [ownerPoolInstance, appPoolInstance].filter((pool): pool is Pool => pool !== null);
  // Clear both references before awaiting cleanup so a shutdown failure cannot
  // leave a closed/rejected singleton available to the next caller.
  ownerPoolInstance = null;
  appPoolInstance = null;

  const results = await Promise.allSettled(pools.map((pool) => pool.end()));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
}

/**
 * Check if the pool is currently connected
 * Useful for health checks
 */
export async function isPoolHealthy(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT 1 as health_check");

    return result.rows.length === 1 && result.rows[0].health_check === 1;
  } catch {
    return false;
  }
}