import { Pool } from "pg"
import { randomUUID, randomBytes, createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { getConnectionConfig } from "../../src/lib/postgres/connection"
import { verifySyntheticSession } from "../../src/lib/digital-brain/local-confinement"

export const fixturePath = path.resolve("docker/epic30-postgres/99-epic30-synthetic-fixtures.sql")
export const manifest = JSON.parse(readFileSync(path.resolve("docker/epic30-postgres/epic30-synthetic-visibility-manifest.json"), "utf8"))
const identifier = (s: string) => `"${s.replaceAll('"', '""')}"`

/** Existing disposable live lane, shared by tests and the explicitly approved local demo. */
export async function provisionSyntheticDatabase(signal?: AbortSignal) {
  signal?.throwIfAborted()
  const missing = ["POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_APP_USER", "POSTGRES_APP_PASSWORD"].filter(key => !process.env[key])
  if (missing.length) throw new Error(`Synthetic provisioning requires explicit settings: ${missing.join(", ")}`)
  const ownerConfig = getConnectionConfig({ role: "owner" })
  const appConfig = getConnectionConfig({ role: "app" })
  if (ownerConfig.host !== "127.0.0.1" || process.env.POSTGRES_PORT !== "5444" ||
      process.env.NODE_ENV === "production" || appConfig.user !== "allura_app" || appConfig.options) {
    throw new Error("Synthetic provisioning requires loopback 5444 and restricted app configuration")
  }
  const runId = randomUUID().replaceAll("-", "")
  const databaseName = `allura_epic30_read_${runId}`
  const receiptRole = `allura_epic30_receipt_${runId}`
  const receiptPassword = randomBytes(32).toString("base64url")
  const receiptWitnessKey = randomBytes(32).toString("base64url")
  const rootPool = new Pool({ ...ownerConfig, database: "postgres", query_timeout: 15_000 })
  const ownerPool = new Pool({ ...ownerConfig, database: databaseName, query_timeout: 15_000, max: 1 })
  const appPool = new Pool({ ...appConfig, database: databaseName, query_timeout: 15_000 })
  const receiptPool = new Pool({ ...appConfig, database: databaseName, user: receiptRole,
    password: receiptPassword, query_timeout: 15_000, max: 1 })
  let created = false; let receiptRoleCreated = false; let closed = false
  let cleanupFailure: Error | undefined
  async function close(drop: boolean) {
    if (cleanupFailure) throw cleanupFailure
    if (closed) return
    const failures: unknown[] = []
    const ended = await Promise.allSettled([appPool.end(), receiptPool.end(), ownerPool.end()])
    failures.push(...ended.filter(result => result.status === "rejected"))
    try { if (drop && created) {
      // Name is generated here, never accepted from arbitrary input; CREATE must have succeeded.
      await rootPool.query(`DROP DATABASE ${identifier(databaseName)} WITH (FORCE)`)
      const check = await rootPool.query("SELECT datname FROM pg_database WHERE datname=$1", [databaseName])
      if (check.rowCount) throw new Error("Synthetic database cleanup verification failed")
    } } catch { failures.push("database drop failed") }
    try { if (drop && receiptRoleCreated) {
      await rootPool.query(`DROP ROLE ${identifier(receiptRole)}`)
      const check = await rootPool.query("SELECT rolname FROM pg_roles WHERE rolname=$1", [receiptRole])
      if (check.rowCount) throw new Error("Synthetic receipt role cleanup verification failed")
    } } catch { failures.push("receipt role drop failed") }
    try { await rootPool.end() } catch { failures.push("root pool close failed") }
    closed = true
    if (failures.length) {
      cleanupFailure = new Error("Synthetic database cleanup failed; owned resources require inspection")
      throw cleanupFailure
    }
  }
  const files = readdirSync(path.resolve("docker/postgres-init")).filter(f => f.endsWith(".sql")).sort()
  const hashes: Record<string,string> = {}
  try {
    await rootPool.query(`CREATE DATABASE ${identifier(databaseName)}`); created = true
    // A per-run cluster role cannot grant document access and is removed with the database.
    await rootPool.query(`CREATE ROLE ${identifier(receiptRole)} WITH LOGIN PASSWORD '${receiptPassword}' NOINHERIT NOBYPASSRLS`)
    receiptRoleCreated = true
    signal?.throwIfAborted()
    for (const file of files) {
      const sql = readFileSync(path.resolve("docker/postgres-init",file),"utf8")
      hashes[file] = createHash("sha256").update(sql).digest("hex")
      await ownerPool.query(sql)
      signal?.throwIfAborted()
    }
    await ownerPool.query(`CREATE SCHEMA epic30_local;
      REVOKE ALL ON SCHEMA epic30_local FROM PUBLIC;
      CREATE TABLE epic30_local.ownership (run_id text PRIMARY KEY, database_name text NOT NULL,
        provisioner text NOT NULL, document_snapshot jsonb);
      REVOKE ALL ON epic30_local.ownership FROM PUBLIC, allura_app;`)
    await ownerPool.query(`CREATE TABLE epic30_local.read_receipts (
      receipt_id uuid PRIMARY KEY, run_id text NOT NULL CHECK (run_id ~ '^[a-f0-9]{32}$'),
      group_id text NOT NULL, workspace_id text NOT NULL, principal_id text NOT NULL,
      actor_role text NOT NULL CHECK (actor_role IN ('viewer', 'curator', 'admin')),
      session_hash text NOT NULL CHECK (session_hash ~ '^[a-f0-9]{64}$'),
      policy_epoch bigint NOT NULL CHECK (policy_epoch > 0),
      action text NOT NULL CHECK (action = 'read_documents'),
      decision text NOT NULL CHECK (decision = 'allow_candidate'),
      reason_code text NOT NULL CHECK (reason_code = 'authorized'),
      policy_version text NOT NULL CHECK (policy_version = 'epic30-local-v2'),
      witness_hash text NOT NULL CHECK (witness_hash ~ '^[a-f0-9]{64}$'),
      occurred_at timestamptz NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (run_id, group_id, workspace_id, principal_id, session_hash, policy_epoch, witness_hash, receipt_id)
    );
    ALTER TABLE epic30_local.read_receipts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE epic30_local.read_receipts FORCE ROW LEVEL SECURITY;
    CREATE POLICY epic30_receipt_insert ON epic30_local.read_receipts
      FOR INSERT TO ${identifier(receiptRole)} WITH CHECK (
        run_id = '${runId}' AND group_id = current_setting('app.current_group_id', true)
        AND workspace_id = current_setting('app.current_workspace_id', true)
        AND principal_id = current_setting('app.current_principal', true));
    CREATE FUNCTION epic30_local.prevent_receipt_mutation() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
      BEGIN RAISE EXCEPTION 'Epic 30 read receipts are immutable'; END $$;
    CREATE TRIGGER epic30_read_receipts_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
      ON epic30_local.read_receipts FOR EACH STATEMENT
      EXECUTE FUNCTION epic30_local.prevent_receipt_mutation();
    REVOKE ALL ON epic30_local.read_receipts FROM PUBLIC, allura_app;
    GRANT USAGE ON SCHEMA epic30_local TO ${identifier(receiptRole)};
    GRANT INSERT ON epic30_local.read_receipts TO ${identifier(receiptRole)};`)
    await ownerPool.query("INSERT INTO epic30_local.ownership VALUES ($1,$2,current_user,NULL)", [runId,databaseName])
    const fixture = readFileSync(fixturePath,"utf8")
    hashes["99-epic30-synthetic-fixtures.sql"] = createHash("sha256").update(fixture).digest("hex")
    await ownerPool.query(fixture)
    const docs = await ownerPool.query("SELECT * FROM brain_documents ORDER BY id")
    const expected = [...new Set<string>([...Object.values(manifest.principals).flat() as string[], ...manifest.scopeScenarios.flatMap((s: {expectedDocumentIds: string[]}) => s.expectedDocumentIds)])].sort()
    if (JSON.stringify(docs.rows.map(d => d.id)) !== JSON.stringify(expected) || docs.rows.length !== manifest.expectedDocumentCount ||
        docs.rows.some(d => !d.content.startsWith("SYNTHETIC TEST DATA:"))) throw new Error("Synthetic fixture manifest mismatch")
    await ownerPool.query(`UPDATE epic30_local.ownership SET document_snapshot =
      (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.brain_documents d);
      CREATE FUNCTION epic30_local.verify_dataset(expected_run text) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
        SELECT EXISTS (SELECT 1 FROM epic30_local.ownership o
          WHERE o.run_id = expected_run AND o.database_name = current_database()
          AND o.database_name = 'allura_epic30_read_' || o.run_id
          AND o.document_snapshot = (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.brain_documents d))
      $$;
      REVOKE ALL ON FUNCTION epic30_local.verify_dataset(text) FROM PUBLIC;
      GRANT USAGE ON SCHEMA epic30_local TO allura_app;
      GRANT EXECUTE ON FUNCTION epic30_local.verify_dataset(text) TO allura_app;`)
    await verifySyntheticSession(appPool.query.bind(appPool), runId)
    signal?.throwIfAborted()
    return {
      runId, databaseName, rootPool, ownerPool, appPool, receiptPool, close,
      receipt: { runId, databaseName, host: "127.0.0.1", port: 5444, groupId: manifest.groupId,
        workspaceId: manifest.workspaceId, principalId: "owner-user", appRole: "allura_app", hashes,
        documentIds: docs.rows.map(d => d.id), dataset: manifest.dataset },
      // Legacy config still requires POSTGRES_PASSWORD. Child receives restricted values in BOTH slots.
      appEnvironment: { POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444", POSTGRES_DB: databaseName,
        POSTGRES_APP_USER: appConfig.user, POSTGRES_APP_PASSWORD: appConfig.password,
        POSTGRES_APP_OPTIONS: "", POSTGRES_USER: appConfig.user, POSTGRES_PASSWORD: appConfig.password,
        POSTGRES_RECEIPT_USER: receiptRole, POSTGRES_RECEIPT_PASSWORD: receiptPassword,
        ALLURA_EPIC30_RECEIPT_KEY: receiptWitnessKey, ALLURA_EPIC30_RUN_ID: runId },
    }
  } catch (error) {
    await close(true)
    // Deliberately do not serialize SQL, connection strings, or provider error messages.
    throw new Error(`Synthetic provisioning failed (${(error as { code?: string }).code ?? "verification"}); owned database cleaned`)
  }
}
