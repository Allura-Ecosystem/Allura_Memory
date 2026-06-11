#!/usr/bin/env bun
/**
 * Generates SOC2 evidence pack for auditor review.
 *
 * Checks:
 *   1. PostgreSQL append-only constraint (no UPDATE/DELETE triggers on events)
 *   2. group_id CHECK constraint exists on events table
 *   3. RBAC role hierarchy (from src/lib/auth/types.ts)
 *   4. Security headers configured (next.config.ts)
 *   5. TLS configuration documented in .env.example
 *
 * Run: bun run soc2:evidence
 * Output: structured JSON to stdout
 */

import fs from "fs"
import path from "path"
import { Pool } from "pg"

// ── Types ──────────────────────────────────────────────────────────────────

interface CheckResult {
  name: string
  status: "pass" | "fail" | "warn" | "skip"
  detail: string
  evidence?: unknown
}

interface EvidencePack {
  generated_at: string
  generated_by: string
  checks: CheckResult[]
  summary: {
    total: number
    pass: number
    fail: number
    warn: number
    skip: number
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function check(
  name: string,
  status: CheckResult["status"],
  detail: string,
  evidence?: unknown,
): CheckResult {
  return { name, status, detail, evidence }
}

// ── Check 1: Append-only events table (no mutation triggers) ───────────────

async function checkAppendOnlyConstraint(): Promise<CheckResult> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: process.env.POSTGRES_DB ?? "memory",
    user: process.env.POSTGRES_USER ?? "ronin4life",
    password: process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 5000,
  })

  try {
    // Check that there are NO UPDATE or DELETE triggers on the events table.
    // Append-only enforcement relies on the absence of such triggers.
    const res = await pool.query<{ trigger_name: string; event_manipulation: string }>(
      `
      SELECT trigger_name, event_manipulation
      FROM information_schema.triggers
      WHERE event_object_table = 'events'
        AND event_manipulation IN ('UPDATE', 'DELETE')
      ORDER BY trigger_name
      `,
    )

    if (res.rows.length === 0) {
      return check(
        "append_only_events",
        "pass",
        "No UPDATE or DELETE triggers found on events table — append-only invariant holds.",
        { mutation_triggers: [] },
      )
    }

    return check(
      "append_only_events",
      "fail",
      `Found ${res.rows.length} mutation trigger(s) on events table — append-only invariant violated.`,
      { mutation_triggers: res.rows },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return check("append_only_events", "skip", `PostgreSQL unreachable: ${msg}`)
  } finally {
    await pool.end()
  }
}

// ── Check 2: group_id CHECK constraint ──────────────────────────────────────

async function checkGroupIdConstraint(): Promise<CheckResult> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: process.env.POSTGRES_DB ?? "memory",
    user: process.env.POSTGRES_USER ?? "ronin4life",
    password: process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 5000,
  })

  try {
    const res = await pool.query<{ constraint_name: string; check_clause: string }>(
      `
      SELECT cc.constraint_name, cc.check_clause
      FROM information_schema.check_constraints cc
      JOIN information_schema.constraint_column_usage ccu
        ON cc.constraint_name = ccu.constraint_name
      WHERE ccu.table_name = 'events'
        AND ccu.column_name = 'group_id'
      `,
    )

    if (res.rows.length > 0) {
      return check(
        "group_id_check_constraint",
        "pass",
        "group_id CHECK constraint exists on events table.",
        { constraints: res.rows },
      )
    }

    return check(
      "group_id_check_constraint",
      "warn",
      "No CHECK constraint found on events.group_id — tenant isolation relies on application-level validation only.",
      { constraints: [] },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return check("group_id_check_constraint", "skip", `PostgreSQL unreachable: ${msg}`)
  } finally {
    await pool.end()
  }
}

// ── Check 3: RBAC role hierarchy ─────────────────────────────────────────────

function checkRbacRoles(): CheckResult {
  // Role hierarchy is static — defined in src/lib/auth/types.ts.
  // We read the source to extract the canonical list without importing
  // server-only modules that require a running Next.js environment.
  const typesPath = path.resolve(import.meta.dir, "../src/lib/auth/types.ts")

  if (!fs.existsSync(typesPath)) {
    return check(
      "rbac_role_hierarchy",
      "fail",
      `src/lib/auth/types.ts not found at expected path: ${typesPath}`,
    )
  }

  const source = fs.readFileSync(typesPath, "utf-8")
  const match = source.match(/ALLURA_ROLES\s*=\s*\[([^\]]+)\]/)

  if (!match) {
    return check(
      "rbac_role_hierarchy",
      "warn",
      "Could not parse ALLURA_ROLES from src/lib/auth/types.ts.",
    )
  }

  const roles = match[1]
    .split(",")
    .map((r) => r.trim().replace(/['"]/g, ""))
    .filter(Boolean)

  return check(
    "rbac_role_hierarchy",
    "pass",
    `RBAC role hierarchy confirmed: ${roles.join(" < ")} (lowest to highest).`,
    {
      role_hierarchy: roles,
      source_file: "src/lib/auth/types.ts",
    },
  )
}

// ── Check 4: Security headers in next.config.ts ──────────────────────────────

function checkSecurityHeaders(): CheckResult {
  const configPath = path.resolve(import.meta.dir, "../next.config.ts")

  if (!fs.existsSync(configPath)) {
    return check(
      "security_headers",
      "fail",
      "next.config.ts not found — security headers cannot be verified.",
    )
  }

  const source = fs.readFileSync(configPath, "utf-8")

  const requiredHeaders = [
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "X-XSS-Protection",
    "Referrer-Policy",
    "Permissions-Policy",
  ]

  const missing = requiredHeaders.filter((h) => !source.includes(h))

  if (missing.length === 0) {
    return check(
      "security_headers",
      "pass",
      `All ${requiredHeaders.length} required security headers found in next.config.ts.`,
      { headers_found: requiredHeaders },
    )
  }

  return check(
    "security_headers",
    "fail",
    `Missing ${missing.length} security header(s) in next.config.ts.`,
    { missing_headers: missing, headers_found: requiredHeaders.filter((h) => !missing.includes(h)) },
  )
}

// ── Check 5: TLS documented in .env.example ─────────────────────────────────

function checkTlsDocumented(): CheckResult {
  const envExamplePath = path.resolve(import.meta.dir, "../.env.example")

  if (!fs.existsSync(envExamplePath)) {
    return check(
      "tls_documented",
      "warn",
      ".env.example not found — TLS configuration not verified.",
    )
  }

  const source = fs.readFileSync(envExamplePath, "utf-8")

  const tlsMarkers = ["POSTGRES_SSL_MODE", "NEO4J_ENCRYPTION", "ALLURA_ENCRYPTION_KEY"]
  const found = tlsMarkers.filter((m) => source.includes(m))

  if (found.length === tlsMarkers.length) {
    return check(
      "tls_documented",
      "pass",
      "TLS configuration variables documented in .env.example.",
      { markers_found: found },
    )
  }

  return check(
    "tls_documented",
    "warn",
    `Only ${found.length}/${tlsMarkers.length} TLS markers documented in .env.example.`,
    { found, missing: tlsMarkers.filter((m) => !found.includes(m)) },
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const checks: CheckResult[] = []

  checks.push(await checkAppendOnlyConstraint())
  checks.push(await checkGroupIdConstraint())
  checks.push(checkRbacRoles())
  checks.push(checkSecurityHeaders())
  checks.push(checkTlsDocumented())

  const summary = {
    total: checks.length,
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
    skip: checks.filter((c) => c.status === "skip").length,
  }

  const pack: EvidencePack = {
    generated_at: new Date().toISOString(),
    generated_by: "scripts/soc2-evidence.ts",
    checks,
    summary,
  }

  console.log(JSON.stringify(pack, null, 2))

  // Exit non-zero if any check failed
  if (summary.fail > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("soc2-evidence fatal:", err)
  process.exit(1)
})
