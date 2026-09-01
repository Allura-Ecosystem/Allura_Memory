/**
 * Story 24.6 — live retrieval executor.
 *
 * The default offline executor only validates that a case is well formed, so
 * every well-formed case "passes" and the lane always scores 1.0. That proves
 * the harness is wired; it measures nothing about retrieval quality. This
 * executor issues a real query against PostgreSQL and computes P@K from what
 * actually came back.
 *
 * Method: lexical retrieval over the generated `content_tsv` column, ranked by
 * `ts_rank_cd`. The hybrid vector path is deliberately NOT used — no embedding
 * service runs in this environment, so a lexical-only number is reported
 * honestly rather than dressed up as hybrid quality.
 *
 * Tenant scope: `allura_memories` carries a PERMISSIVE tenant policy and a
 * RESTRICTIVE workspace policy, both FORCED. Every statement therefore runs
 * inside a transaction that sets `app.current_group_id` and
 * `app.current_workspace_id` via SET LOCAL, so the database enforces isolation
 * on the evaluation path exactly as it does in production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const GROUP_ID = process.env.EVAL_GROUP_ID ?? "allura-system";
const WORKSPACE_ID = process.env.EVAL_WORKSPACE_ID ?? "workspace-allura";
const SESSION_ID = "eval-live-retrieval";
const USER_ID = "eval-harness";

export interface RetrievalCase {
  id: string;
  query: string;
  expected_memory_ids: string[];
  k: number;
}

function connect(): Client {
  return new Client({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: process.env.POSTGRES_DB ?? "memory",
    user: process.env.POSTGRES_USER ?? "allura",
    password: process.env.POSTGRES_PASSWORD,
  });
}

/** Open a transaction with the tenant/workspace GUCs the RLS policies require. */
async function beginScoped(client: Client): Promise<void> {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.current_group_id', $1, true)", [GROUP_ID]);
  await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [WORKSPACE_ID]);
}

/**
 * Load the labeled corpus into `allura_memories`, replacing any prior copy.
 * The corpus is small, synthetic, and tenant-scoped; the memory_id lives in
 * metadata so retrieval results can be matched back to expected ids.
 */
export async function seedCorpus(corpusPath: string): Promise<number> {
  const corpus = JSON.parse(readFileSync(resolve(process.cwd(), corpusPath), "utf8"));
  const client = connect();
  await client.connect();
  try {
    await beginScoped(client);
    await client.query(
      `DELETE FROM allura_memories
        WHERE group_id = $1 AND metadata->>'eval_corpus' = 'relevance'`,
      [GROUP_ID],
    );
    for (const doc of corpus.documents) {
      await client.query(
        `INSERT INTO allura_memories
           (session_id, user_id, content, memory_type, metadata,
            group_id, workspace_id, workspace_scope_state)
         VALUES ($1, $2, $3, 'semantic', $4, $5, $6, 'workspace_scoped')`,
        [
          SESSION_ID,
          USER_ID,
          doc.content,
          JSON.stringify({ eval_corpus: "relevance", memory_id: doc.memory_id }),
          GROUP_ID,
          WORKSPACE_ID,
        ],
      );
    }
    await client.query("COMMIT");
    return corpus.documents.length;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/** Run one query and return the ranked memory_ids, best first. */
export async function retrieve(query: string, k: number): Promise<string[]> {
  const client = connect();
  await client.connect();
  try {
    await beginScoped(client);
    const res = await client.query(
      `SELECT metadata->>'memory_id' AS memory_id,
              ts_rank_cd(content_tsv, websearch_to_tsquery('english', $1)) AS rank
         FROM allura_memories
        WHERE group_id = $2
          AND deleted_at IS NULL
          AND metadata->>'eval_corpus' = 'relevance'
          AND content_tsv @@ websearch_to_tsquery('english', $1)
        ORDER BY rank DESC, id ASC
        LIMIT $3`,
      [query, GROUP_ID, k],
    );
    await client.query("COMMIT");
    return res.rows.map((r) => r.memory_id as string).filter(Boolean);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/**
 * P@K for one case: the fraction of the top-K results that are relevant,
 * normalised by min(K, |relevant|) so a query with a single correct answer can
 * still reach 1.0. Returns 0 when nothing was retrieved.
 */
export function precisionAtK(retrieved: string[], expected: string[], k: number): number {
  const top = retrieved.slice(0, k);
  if (top.length === 0) return 0;
  const hits = top.filter((id) => expected.includes(id)).length;
  return hits / Math.min(k, Math.max(expected.length, 1));
}

export interface LiveCaseResult {
  id: string;
  query: string;
  expected: string[];
  retrieved: string[];
  precision: number;
  passed: boolean;
}

/** Execute every query in the corpus and score it against its labels. */
export async function runLiveRetrieval(corpusPath: string): Promise<{
  cases: LiveCaseResult[];
  meanPrecision: number;
}> {
  const corpus = JSON.parse(readFileSync(resolve(process.cwd(), corpusPath), "utf8"));
  const cases: LiveCaseResult[] = [];
  for (const q of corpus.queries as RetrievalCase[]) {
    const retrieved = await retrieve(q.query, q.k);
    const precision = precisionAtK(retrieved, q.expected_memory_ids, q.k);
    cases.push({
      id: q.id,
      query: q.query,
      expected: q.expected_memory_ids,
      retrieved,
      precision,
      passed: precision > 0,
    });
  }
  const meanPrecision =
    cases.length === 0 ? 0 : cases.reduce((a, c) => a + c.precision, 0) / cases.length;
  return { cases, meanPrecision };
}
