// Runs only in a disposable integration client; every database is freshly owned by its harness.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
const client = new pg.Client({ host: "postgres", database: "memory", user: "allura_owner", password: process.env.POSTGRES_PASSWORD, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const seedSql = await readFile("/bundle/migrations/33-tenant-registry.sql", "utf8");
  for (const [setting, expected] of [[null, 4], ["off", 4], ["on", 0]]) {
    await client.query("BEGIN");
    try {
      if (setting !== null) await client.query("SELECT set_config('allura.fresh_company_install',$1,true)", [setting]);
      await client.query(seedSql);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM tenants")).rows[0].n, expected);
    } finally { await client.query("ROLLBACK"); }
  }
  console.log("PASS: legacy seed switch absent/off retains four registry rows; on yields zero; probe transactions rolled back");
  for (const table of ["tenants", "workspaces", "graph_memories", "mcp_tokens"]) assert.equal((await client.query("SELECT count(*)::int AS n FROM " + table)).rows[0].n, 0);
  const roles = (await client.query("SELECT rolname,rolsuper,rolinherit,rolbypassrls FROM pg_roles WHERE rolname IN ('allura_app','allura_migration') ORDER BY rolname")).rows;
  assert.deepEqual(roles, [
    { rolname: "allura_app", rolsuper: false, rolinherit: false, rolbypassrls: false },
    { rolname: "allura_migration", rolsuper: false, rolinherit: false, rolbypassrls: true },
  ]);
  const app = new pg.Client({ host: "postgres", database: "memory", user: "allura_app", password: process.env.POSTGRES_APP_PASSWORD, connectionTimeoutMillis: 5000 });
  try {
    await app.connect();
    assert.equal((await app.query("SELECT count(*)::int AS n FROM graph_memories")).rows[0].n, 0);
  } finally { await app.end(); }
  for (const user of ["allura_app", "allura_migration"]) {
    const bad = new pg.Client({ host: "postgres", database: "memory", user, password: "change-me-in-production", connectionTimeoutMillis: 3000 });
    try { await assert.rejects(bad.connect(), error => error.code === "28P01"); }
    finally { await bad.end(); }
  }
  for (const [base, ready] of [["http://gateway:6201", "/ready"], ["http://web:4200", "/api/health/ready"]]) {
    const response = await fetch(base + ready, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ready, true); assert.equal(body.checks.postgres.healthy, true); assert.equal(body.checks.mcp.healthy, true);
  }
  for (const headers of [{}, { "x-allura-role": "admin", "x-allura-group-id": "allura-system", "x-allura-workspace-id": "forged" }]) {
    for (const path of ["/api/agents", "/api/memory/graph", "/api/tokens"]) {
      const response = await fetch("http://web:4200" + path, { headers, redirect: "manual", signal: AbortSignal.timeout(8000) });
      assert.equal(response.status, 401);
    }
    const response = await fetch("http://web:4200/dashboard", { headers, redirect: "manual", signal: AbortSignal.timeout(8000) });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), "http://web:4200").pathname, "/auth/v2/login");
  }
  assert.equal((await fetch("http://web:4200/auth/v2/login", { signal: AbortSignal.timeout(8000) })).status, 200);
  assert.equal((await fetch("http://gateway:6201/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
  console.log("PASS: empty company state, restricted app role, default-password refusal, gateway/web dependency readiness, anonymous/forged authority denial");
} finally { await client.end(); }
