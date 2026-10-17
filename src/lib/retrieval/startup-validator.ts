/**
 * Startup validation for the retrieval gateway.
 * Ensures pgvector, the HNSW index, and the semantic-store tables
 * (graph_memories, graph_supersedes) exist before any queries are served.
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

async function checkSemanticStore(client: any): Promise<HealthCheck> {
  try {
    const res = await client.query(
      "SELECT to_regclass('graph_memories') AS memories, to_regclass('graph_supersedes') AS supersedes"
    );
    const row = res.rows[0] ?? {};
    const missing = ['graph_memories', 'graph_supersedes'].filter(
      (table) => !row[table === 'graph_memories' ? 'memories' : 'supersedes']
    );
    if (missing.length > 0) {
      return { name: 'semantic_store_tables', status: 'fail', message: `Semantic store tables missing: ${missing.join(', ')}` };
    }
    return { name: 'semantic_store_tables', status: 'pass', message: 'Semantic store tables present' };
  } catch (e: any) {
    return { name: 'semantic_store_tables', status: 'fail', message: `Semantic store check error: ${e.message}` };
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
      checks.push(await checkSemanticStore(pgClient));
    } catch (e: any) {
      checks.push({ name: 'postgres_connection', status: 'fail', message: `Could not connect to PostgreSQL: ${e.message}` });
    } finally {
      if (pgClient) await pgClient.end().catch(() => {});
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
