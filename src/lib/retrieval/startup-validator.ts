/**
 * Startup validation for the retrieval gateway.
 * Ensures pgvector, HNSW, Neo4j indexes, and schema labels exist
 * before any queries are served.
 */

import { RetrievalConfig } from './contract';

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  detail?: Record<string, unknown>;
}

export interface StartupReport {
  healthy: boolean;
  checks: HealthCheck[];
  degraded: boolean;
  timestamp: string;
}

let cachedReport: StartupReport | null = null;
let validationPromise: Promise<StartupReport> | null = null;

async function getPgClient(url: string) {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
}

async function getNeo4jDriver(url: string) {
  const neo4j = await import('neo4j-driver');
  const driver = neo4j.default.driver(url, undefined, { connectionTimeout: 5000 });
  return driver;
}

async function checkPgvector(client: any): Promise<HealthCheck> {
  try {
    const res = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
    if (res.rows.length === 0) {
      return { name: 'pgvector_extension', status: 'fail', message: 'pgvector extension is not installed' };
    }
    return { name: 'pgvector_extension', status: 'pass', message: 'pgvector extension installed', detail: { version: res.rows[0].extversion } };
  } catch (e: any) {
    return { name: 'pgvector_extension', status: 'fail', message: `pgvector check error: ${e.message}` };
  }
}

async function checkHnswIndex(client: any): Promise<HealthCheck> {
  try {
    const res = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'allura_memories'
        AND indexdef LIKE '%hnsw%'
    `);
    if (res.rows.length === 0) {
      return { name: 'hnsw_index', status: 'fail', message: 'No HNSW index found on allura_memories.embedding' };
    }
    return { name: 'hnsw_index', status: 'pass', message: 'HNSW index present', detail: { index: res.rows[0].indexname } };
  } catch (e: any) {
    return { name: 'hnsw_index', status: 'fail', message: `HNSW check error: ${e.message}` };
  }
}

async function checkNeo4jMemoryIndex(driver: any): Promise<HealthCheck> {
  try {
    const session = driver.session();
    const res = await session.run(`
      SHOW INDEXES YIELD name, type, entityType, labelsOrTypes
      WHERE name = 'memory_search_index'
    `);
    await session.close();
    if (res.records.length === 0) {
      return { name: 'neo4j_fulltext_index', status: 'fail', message: 'Neo4j fulltext index memory_search_index does not exist' };
    }
    return { name: 'neo4j_fulltext_index', status: 'pass', message: 'Neo4j fulltext index present' };
  } catch (e: any) {
    return { name: 'neo4j_fulltext_index', status: 'fail', message: `Neo4j index check error: ${e.message}` };
  }
}

async function checkNeo4jSchemaLabels(driver: any): Promise<HealthCheck> {
  try {
    const session = driver.session();
    const labels = ['Memory', 'Agent', 'Project'];
    const checks = await Promise.all(
      labels.map(async (label) => {
        const res = await session.run(`MATCH (n:${label}) RETURN count(n) AS cnt LIMIT 1`);
        return { label, count: res.records[0]?.get('cnt').toNumber() ?? 0 };
      })
    );
    await session.close();
    const missing = checks.filter((c) => c.count === 0).map((c) => c.label);
    if (missing.length > 0) {
      return { name: 'neo4j_schema_labels', status: 'warn', message: `Neo4j schema labels present but empty: ${missing.join(', ')}`, detail: { labels: checks } };
    }
    return { name: 'neo4j_schema_labels', status: 'pass', message: 'All required Neo4j labels present and populated', detail: { labels: checks } };
  } catch (e: any) {
    return { name: 'neo4j_schema_labels', status: 'fail', message: `Neo4j schema check error: ${e.message}` };
  }
}

export async function validateStartup(config: RetrievalConfig, opts?: { force?: boolean }): Promise<StartupReport> {
  if (cachedReport && !opts?.force) {
    return cachedReport;
  }
  if (validationPromise && !opts?.force) {
    return validationPromise;
  }

  validationPromise = (async () => {
    const checks: HealthCheck[] = [];
    let degraded = false;

    // PostgreSQL checks
    let pgClient;
    try {
      pgClient = await getPgClient(config.postgres_url);
      checks.push(await checkPgvector(pgClient));
      checks.push(await checkHnswIndex(pgClient));
    } catch (e: any) {
      checks.push({ name: 'postgres_connection', status: 'fail', message: `Could not connect to PostgreSQL: ${e.message}` });
    } finally {
      if (pgClient) await pgClient.end().catch(() => {});
    }

    // Neo4j checks
    let driver;
    try {
      driver = await getNeo4jDriver(config.neo4j_url);
      checks.push(await checkNeo4jMemoryIndex(driver));
      checks.push(await checkNeo4jSchemaLabels(driver));
    } catch (e: any) {
      checks.push({ name: 'neo4j_connection', status: 'fail', message: `Could not connect to Neo4j: ${e.message}` });
    } finally {
      if (driver) await driver.close().catch(() => {});
    }

    const failed = checks.filter((c) => c.status === 'fail');
    const warnings = checks.filter((c) => c.status === 'warn');
    const healthy = failed.length === 0;
    degraded = warnings.length > 0 || !healthy;

    const report: StartupReport = {
      healthy,
      checks,
      degraded,
      timestamp: new Date().toISOString(),
    };

    cachedReport = report;
    return report;
  })();

  return validationPromise;
}

export function clearStartupCache() {
  cachedReport = null;
  validationPromise = null;
}
