import * as neo4j from "neo4j-driver";
import type { Driver, ManagedTransaction, Session } from "neo4j-driver";
import { env } from "process";
import { Neo4jConnectionError, Neo4jQueryError } from "../errors/neo4j-errors";

export type { ManagedTransaction };

// Server-only guard: throw if imported in browser environment
if (typeof window !== "undefined") {
  throw new Error("Neo4j connection module can only be used server-side");
}

/**
 * Neo4j connection configuration
 * Built from environment variables with safe defaults
 */
export interface Neo4jConnectionConfig {
  uri: string;
  user: string;
  password: string;
  database: string;
  maxConnectionPoolSize: number;
  connectionAcquisitionTimeout: number;
  maxTransactionRetryTime: number;
}

/**
 * Pool configuration for connection safety
 */
interface PoolConfig {
  maxConnectionPoolSize: number;
  connectionAcquisitionTimeout: number;
  maxTransactionRetryTime: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxConnectionPoolSize: parseInt(env.NEO4J_POOL_MAX || "50", 10),
  connectionAcquisitionTimeout: parseInt(env.NEO4J_ACQUISITION_TIMEOUT || "10000", 10),
  maxTransactionRetryTime: parseInt(env.NEO4J_RETRY_TIME || "30000", 10),
};

// Singleton driver instance
let driverInstance: Driver | null = null;

type Neo4jDriverModule = typeof neo4j & {
  default?: Pick<typeof neo4j, "driver" | "auth">;
};

function safeModuleProperty<K extends "driver" | "auth">(
  module: Neo4jDriverModule,
  key: K
): Pick<typeof neo4j, "driver" | "auth">[K] | undefined {
  try {
    return module[key];
  } catch {
    return undefined;
  }
}

function getNeo4jModule(): Pick<typeof neo4j, "driver" | "auth"> {
  const module = neo4j as Neo4jDriverModule;
  const defaultModule = module.default;
  return {
    driver: safeModuleProperty(module, "driver") ?? defaultModule?.driver,
    auth: safeModuleProperty(module, "auth") ?? defaultModule?.auth,
  } as Pick<typeof neo4j, "driver" | "auth">;
}

/**
 * Get connection configuration from environment variables
 * Uses safe defaults matching docker-compose.yml setup
 */
export function getConnectionConfig(): Neo4jConnectionConfig {
  const password = env.NEO4J_PASSWORD;
  
  if (!password) {
    throw new Error("NEO4J_PASSWORD environment variable is required");
  }
  
  return {
    uri: env.NEO4J_URI || "bolt://localhost:7687",
    user: env.NEO4J_USER || "neo4j",
    password,
    database: env.NEO4J_DATABASE || "neo4j",
    maxConnectionPoolSize: DEFAULT_POOL_CONFIG.maxConnectionPoolSize,
    connectionAcquisitionTimeout: DEFAULT_POOL_CONFIG.connectionAcquisitionTimeout,
    maxTransactionRetryTime: DEFAULT_POOL_CONFIG.maxTransactionRetryTime,
  };
}

/**
 * Get or create the singleton Neo4j driver instance
 * Uses server-only pattern - should only be called from server-side code
 */
export function getDriver(): Driver {
  if (!driverInstance) {
    const config = getConnectionConfig();
    const driverModule = getNeo4jModule();

    driverInstance = driverModule.driver(
      config.uri,
      driverModule.auth.basic(config.user, config.password),
      {
        maxConnectionPoolSize: config.maxConnectionPoolSize,
        connectionAcquisitionTimeout: config.connectionAcquisitionTimeout,
        maxTransactionRetryTime: config.maxTransactionRetryTime,
      }
    );

    // Log connection events in development
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Neo4j Driver] Connecting to ${config.uri}`);
    }
  }

  return driverInstance;
}

/**
 * Get a session from the driver
 * @param database - Optional database name (defaults to 'neo4j')
 * @returns A Neo4j session
 */
export function getSession(database?: string): Session {
  const driver = getDriver();
  return driver.session({ database: database || "neo4j" });
}

/**
 * Close the driver connection
 * Call this during graceful shutdown
 */
export async function closeDriver(): Promise<void> {
  if (driverInstance) {
    await driverInstance.close();
    driverInstance = null;
  }
}

/**
 * Check if the driver is currently connected
 * Useful for health checks
 */
export async function isDriverHealthy(): Promise<boolean> {
  try {
    const driver = getDriver();
    const session = driver.session();
    
    try {
      const result = await session.run("RETURN 1 as health_check");
      return result.records.length === 1 && 
        result.records[0].get("health_check").toNumber() === 1;
    } finally {
      await session.close();
    }
  } catch {
    return false;
  }
}

/**
 * Verify connectivity to the Neo4j database
 * Throws if connection fails
 */
export async function verifyConnectivity(): Promise<void> {
  const driver = getDriver();
  await driver.verifyConnectivity();
}

/**
 * Execute a read transaction with automatic retry on transient errors
 * @param work - The transaction function to execute
 * @param database - Optional database name
 * @returns The result of the work function
 */
export async function readTransaction<T>(
  work: (tx: ManagedTransaction) => Promise<T>,
  database?: string
): Promise<T> {
  const driver = getDriver();
  const session = driver.session({ database: database || "neo4j" });
  
  const NEO4J_DRIVER_ERRORS = new Set(['ServiceUnavailableError', 'SessionExpiredError', 'AuthorizationExpiredError', 'Neo4jError']);
  try {
    return await session.executeRead(work);
  } catch (err) {
    // Re-throw app-level errors untouched
    if (err instanceof Error && !NEO4J_DRIVER_ERRORS.has(err.name)) {
      throw err;
    }
    const cause = err instanceof Error ? err : new Error(String(err));
    if (err instanceof Error && ['ServiceUnavailableError', 'SessionExpiredError', 'AuthorizationExpiredError'].includes(err.name)) {
      throw new Neo4jConnectionError(cause);
    }
    throw new Neo4jQueryError('readTransaction', cause);
  } finally {
    await session.close();
  }
}

/**
 * Execute a write transaction with automatic retry on transient errors
 * @param work - The transaction function to execute
 * @param database - Optional database name
 * @returns The result of the work function
 */
export async function writeTransaction<T>(
  work: (tx: ManagedTransaction) => Promise<T>,
  database?: string
): Promise<T> {
  const driver = getDriver();
  const session = driver.session({ database: database || "neo4j" });
  
  const NEO4J_DRIVER_ERRORS = new Set(['ServiceUnavailableError', 'SessionExpiredError', 'AuthorizationExpiredError', 'Neo4jError']);
  try {
    return await session.executeWrite(work);
  } catch (err) {
    // Re-throw app-level errors untouched
    if (err instanceof Error && !NEO4J_DRIVER_ERRORS.has(err.name)) {
      throw err;
    }
    const cause = err instanceof Error ? err : new Error(String(err));
    if (err instanceof Error && ['ServiceUnavailableError', 'SessionExpiredError', 'AuthorizationExpiredError'].includes(err.name)) {
      throw new Neo4jConnectionError(cause);
    }
    throw new Neo4jQueryError('writeTransaction', cause);
  } finally {
    await session.close();
  }
}
