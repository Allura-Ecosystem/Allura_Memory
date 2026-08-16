/**
 * Persistence of MCP authentication/authorization decisions (AC-7).
 *
 * Story 24.2, review Finding 2.
 *
 * Projects an `AuthAuditEvent` into the append-only `events` table
 * (docker/postgres-init/00-traces.sql). AC-7's fields ride in the `metadata`
 * JSONB column: the hot events table is NOT altered and no migration is added.
 *
 * WHY A DIRECT `insertEvent` RATHER THAN POST /api/trace
 * -----------------------------------------------------
 * `src/lib/auth/edge-audit.ts#emitGatedAudit` reaches the events table over
 * HTTP because Edge Runtime middleware cannot import `pg`. That constraint does
 * not apply here: the MCP gateway and the stdio server are Node processes that
 * already hold a pg pool (canonical-tools writes memories through it). We
 * therefore call `insertEvent` — the exact function `/api/trace` itself calls,
 * one layer below the HTTP hop — which avoids making the MCP gateway depend on
 * the Next.js app being up, avoids a second copy of the shared-secret, and
 * avoids needing a base-URL config the gateway does not otherwise have. The
 * sink is injectable, so an HTTP sink can be substituted without touching
 * callers.
 *
 * FAILURE POLICY
 * Auth must never fail closed *because* audit is unreachable. Every emit is
 * fire-and-forget and never throws. The structured `[mcp-auth]` line is always
 * written, so the decision is recorded even when the database is down, and a
 * persistence failure is itself logged as `[mcp-auth-persist-failed]`.
 *
 * CREDENTIAL SAFETY
 * The payload is built only from an `AuthAuditEvent`, which by construction
 * carries no raw token and no token hash (see `principal-context.ts`). The
 * builder below is pure and exported so tests can assert that directly.
 */

import type { AuthAuditEvent } from "./principal-context";

/** events.status is constrained by chk_events_valid_status. */
export type AuditEventStatus = "pending" | "completed" | "failed" | "cancelled";

/** Shape accepted by `insertEvent` (structural — avoids a hard pg import). */
export interface AuthAuditEventInsert {
  group_id: string;
  event_type: "mcp_auth_decision";
  agent_id: string;
  status: AuditEventStatus;
  metadata: {
    principal_id: string;
    effective_tenant: string | null;
    roles: readonly string[];
    session_id: string;
    tool: string;
    decision: string;
    reason_code: string;
    auth_method: string;
    credential_id: string | null;
    occurred_at: string;
  };
}

/**
 * Tenant used when a request is refused before any tenant could be resolved
 * (e.g. missing or malformed credentials). `events.group_id` is NOT NULL and
 * format-constrained, so denials still have to land somewhere: they land in the
 * platform tenant, with `effective_tenant: null` preserved in metadata.
 */
const FALLBACK_TENANT = "allura-system";

const GROUP_ID_PATTERN = /^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Project an auth decision into an append-only events row.
 *
 * Pure and total — exported for testing. Never throws.
 */
export function buildAuthAuditInsert(event: AuthAuditEvent): AuthAuditEventInsert {
  const tenant =
    event.effective_tenant && GROUP_ID_PATTERN.test(event.effective_tenant)
      ? event.effective_tenant
      : FALLBACK_TENANT;

  return {
    group_id: tenant,
    event_type: "mcp_auth_decision",
    // agent_id is NOT NULL in events; an unauthenticated caller has no identity.
    agent_id: event.principal_id || "anonymous",
    // "allow" completed the gate; "deny" did not pass it.
    status: event.decision === "allow" ? "completed" : "failed",
    metadata: {
      principal_id: event.principal_id,
      effective_tenant: event.effective_tenant,
      roles: event.roles,
      session_id: event.session_id,
      tool: event.tool,
      decision: event.decision,
      reason_code: event.reason_code,
      auth_method: event.auth_method,
      credential_id: event.credential_id,
      occurred_at: event.occurred_at,
    },
  };
}

/** Sink that persists one audit row. */
export type AuthAuditSink = (row: AuthAuditEventInsert) => Promise<unknown>;

let sinkOverride: AuthAuditSink | null = null;

/** Override the persistence sink (tests, or to substitute an HTTP sink). */
export function setAuthAuditSink(sink: AuthAuditSink | null): void {
  sinkOverride = sink;
}

/**
 * Default sink: the same `insertEvent` used by POST /api/trace.
 * Imported lazily so this module stays DB-free until an event is actually
 * persisted, keeping unit tests infrastructure-free.
 */
async function defaultSink(row: AuthAuditEventInsert): Promise<unknown> {
  const { insertEvent } = await import("@/lib/postgres/queries/insert-trace");
  return insertEvent(row);
}

/** Structured log line. Always written, and the sole record if the DB is down. */
function logAuthDecision(event: AuthAuditEvent, logger: Pick<Console, "log">): void {
  try {
    logger.log(`[mcp-auth] ${JSON.stringify(event)}`);
  } catch {
    // never throw from the audit path
  }
}

export interface EmitAuthAuditOptions {
  /** Where the structured line goes. stdio must use stderr, not stdout. */
  logger?: Pick<Console, "log" | "error">;
  /** Override the sink for this call. */
  sink?: AuthAuditSink;
  /** Set false to skip persistence entirely (log only). */
  persist?: boolean;
}

/**
 * Record an auth decision: structured line always, append-only row best effort.
 *
 * Fire-and-forget. Never throws, never rejects, never blocks the caller.
 * Returns the in-flight persistence promise so tests can await it.
 */
export function emitAuthAudit(
  event: AuthAuditEvent,
  options: EmitAuthAuditOptions = {},
): Promise<void> {
  const logger = options.logger ?? console;
  logAuthDecision(event, logger);

  if (options.persist === false) return Promise.resolve();

  const sink = options.sink ?? sinkOverride ?? defaultSink;

  let row: AuthAuditEventInsert;
  try {
    row = buildAuthAuditInsert(event);
  } catch (error) {
    logger.error(`[mcp-auth-persist-failed] could not build audit row: ${String(error)}`);
    return Promise.resolve();
  }

  return Promise.resolve()
    .then(() => sink(row))
    .then(() => undefined)
    .catch((error: unknown) => {
      // An audit-emit failure must itself be visible, but must NEVER surface to
      // the caller: authentication does not fail because auditing is down.
      logger.error(
        `[mcp-auth-persist-failed] tool=${event.tool} decision=${event.decision} ` +
          `reason=${event.reason_code}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
}
