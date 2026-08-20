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

// Singleton pool instance
let poolInstance: Pool | null = null;

/**
 * Get connection configuration from environment variables
 * Uses safe defaults matching docker-compose.yml setup
 */
export function getConnectionConfig(): ConnectionConfig {
  const password = env.POSTGRES_PASSWORD;

  if (!password) {
    throw new Error("POSTGRES_PASSWORD environment variable is required");
  }

  // Story 24.3: optional application role. If POSTGRES_APP_USER is set, the
  // service connects as the restricted application role that is subject to RLS.
  // Otherwise we fall back to the owner/migration role for backwards compatibility.
  const appUser = env.POSTGRES_APP_USER;
  const appPassword = env.POSTGRES_APP_PASSWORD;

  return {
    host: env.POSTGRES_HOST || "localhost",
    port: parseInt(env.POSTGRES_PORT || "5432", 10),
    database: env.POSTGRES_DB || "memory",
    user: appUser || env.POSTGRES_USER || "ronin4life",
    // Only use the app role password when the app role is explicitly selected.
    password: appUser ? appPassword || password : password,
    connectionTimeoutMillis: DEFAULT_POOL_CONFIG.connectionTimeoutMillis,
    idleTimeoutMillis: DEFAULT_POOL_CONFIG.idleTimeoutMillis,
    max: DEFAULT_POOL_CONFIG.maxConnections,
  };
}

/**
 * Get or create the singleton PostgreSQL connection pool
 * Uses server-only pattern - should only be called from server-side code
 */
export function getPool(): Pool {
  if (!poolInstance) {
    const config = getConnectionConfig();

    poolInstance = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      idleTimeoutMillis: config.idleTimeoutMillis,
      max: config.max,
    });

    // Error handling: prevent silent crashes
    // This must be attached before any queries are made
    poolInstance.on("error", (err: Error) => {
      // Log background connection failures without throwing
      // This is important for idle connections dropping
      console.error("[PostgreSQL Pool] Unexpected error on idle client:", err.message);

      // Don't exit the process - let the application handle recovery
      // The pool will attempt to reconnect on next query
    });

    poolInstance.on("connect", () => {
      // Log successful connections in development for debugging
      if (process.env.NODE_ENV !== "production") {
        console.log("[PostgreSQL Pool] New client connected");
      }
    });
  }

  return poolInstance;
}

/**
 * Get a dedicated pool that connects as the restricted application role.
 * Used by Story 24.3 tests and break-glass tooling. The main service should
 * prefer the env-based `POSTGRES_APP_USER` path; this helper exists for tests
 * that must compare owner vs. application-role behavior.
 */
export function getAppPool(): Pool {
  const ownerConfig = getConnectionConfig();
  const appUser = process.env.POSTGRES_APP_USER || "allura_app";
  const appPassword = process.env.POSTGRES_APP_PASSWORD || "change-me-in-production";

  const pool = new Pool({
    host: ownerConfig.host,
    port: ownerConfig.port,
    database: ownerConfig.database,
    user: appUser,
    password: appPassword,
    connectionTimeoutMillis: ownerConfig.connectionTimeoutMillis,
    idleTimeoutMillis: ownerConfig.idleTimeoutMillis,
    max: ownerConfig.max,
  });

  pool.on("error", (err: Error) => {
    console.error("[PostgreSQL App Pool] Unexpected error on idle client:", err.message);
  });

  return pool;
}

/**
 * Close the connection pool
 * Call this during graceful shutdown
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
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