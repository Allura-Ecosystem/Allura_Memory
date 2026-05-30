/**
 * Sentry Integration for Allura Memory
 *
 * Provides a thin abstraction over @sentry/nextjs that:
 * - Is a complete no-op when DSN is not configured (dev mode)
 * - Captures exceptions with structured context
 * - Supports performance transactions
 * - Adds request context (method, path, group_id)
 * - Gracefully degrades when Sentry is unavailable
 *
 * Usage:
 *   import { initSentry, captureException, withSentry } from "@/lib/observability/sentry";
 *
 *   // Initialize at app startup
 *   initSentry();
 *
 *   // Capture errors
 *   try { ... } catch (error) {
 *     captureException(error, { tags: { component: "mcp-gateway" } });
 *   }
 *
 *   // Wrap API handlers
 *   export default withSentry(handler);
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scope = any;

import type { IncomingMessage } from "http";
import type { SentryConfig } from "./config";
import { loadSentryConfig } from "./config";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CaptureContext {
  /** Tags for filtering in Sentry UI */
  tags?: Record<string, string | number | boolean>;
  /** Extra data attached to the event */
  extra?: Record<string, unknown>;
  /** User information */
  user?: { id: string; email?: string; username?: string };
  /** Fingerprint for grouping */
  fingerprint?: string[];
}

export interface TransactionContext {
  /** Transaction name (e.g., "POST /mcp") */
  name: string;
  /** Operation type (e.g., "http.server") */
  op: string;
  /** Tags for the transaction */
  tags?: Record<string, string | number | boolean>;
}

export interface SentryTransaction {
  /** Set a tag on the transaction */
  setTag(key: string, value: string | number | boolean): void;
  /** Set data attribute on the transaction */
  setData(key: string, value: unknown): void;
  /** Mark the transaction as finished */
  finish(): void;
}

// ── No-op Implementations ─────────────────────────────────────────────────────

/** No-op transaction when Sentry is disabled */
class NoOpTransaction implements SentryTransaction {
  setTag(_key: string, _value: string | number | boolean): void {
    // no-op
  }
  setData(_key: string, _value: unknown): void {
    // no-op
  }
  finish(): void {
    // no-op
  }
}

// ── Sentry Client Reference ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sentryClient: any = null;
let _config: SentryConfig | null = null;
let _initialized = false;

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Initialize Sentry with environment-based configuration.
 *
 * If no DSN is configured, this is a no-op. All subsequent calls to
 * captureException, captureMessage, etc. will also be no-ops.
 *
 * This is safe to call multiple times — subsequent calls are no-ops.
 */
export function initSentry(config?: SentryConfig): void {
  if (_initialized) return;

  _config = config ?? loadSentryConfig();

  if (!_config.enabled) {
    _initialized = true;
    return;
  }

  try {
    // Keep require behind eval so Next does not try to bundle this optional
    // dependency when Sentry is disabled in local/dev environments.
    const optionalRequire = eval("require") as NodeRequire;
    const Sentry = optionalRequire("@sentry/nextjs");

    Sentry.init({
      dsn: _config.dsn,
      environment: _config.environment,
      tracesSampleRate: _config.tracesSampleRate,
      profilesSampleRate: _config.profilesSampleRate,
      release: _config.release,
      // Don't send errors in development
      beforeSend(event: Record<string, unknown>) {
        if (_config?.environment === "development") {
          // Log to console in dev instead of sending
          console.error("[sentry] Captured error in development (not sent):", event);
          return null;
        }
        return event;
      },
    });

    _sentryClient = Sentry;
    _initialized = true;

    console.log(
      `[sentry] Initialized for environment: ${_config.environment}` +
        (_config.release ? ` (release: ${_config.release})` : "")
    );
  } catch (error) {
    // Sentry is optional — if it fails to load, we continue without it
    console.warn(
      "[sentry] Failed to initialize. Error tracking will be disabled.",
      error instanceof Error ? error.message : String(error)
    );
    _initialized = true; // Don't retry on every call
  }
}

/**
 * Check if Sentry is initialized and enabled.
 */
export function isSentryEnabled(): boolean {
  return _initialized && _config?.enabled === true && _sentryClient !== null;
}

// ── Error Capture ─────────────────────────────────────────────────────────────

/**
 * Capture an exception with optional context.
 *
 * No-op when Sentry is not configured.
 */
export function captureException(
  error: Error | unknown,
  context?: CaptureContext
): void {
  if (!isSentryEnabled() || !_sentryClient) return;

  try {
    _sentryClient.withScope((scope: Scope) => {
      if (context?.tags) {
        for (const [key, value] of Object.entries(context.tags)) {
          scope.setTag(key, value);
        }
      }
      if (context?.extra) {
        for (const [key, value] of Object.entries(context.extra)) {
          scope.setExtra(key, value);
        }
      }
      if (context?.user) {
        scope.setUser(context.user);
      }
      if (context?.fingerprint) {
        scope.setFingerprint(context.fingerprint);
      }
      _sentryClient!.captureException(error);
    });
  } catch {
    // Never let Sentry errors propagate
  }
}

/**
 * Capture a message with a severity level.
 *
 * No-op when Sentry is not configured.
 */
export function captureMessage(
  message: string,
  level: "debug" | "info" | "warning" | "error" | "fatal" = "info"
): void {
  if (!isSentryEnabled() || !_sentryClient) return;

  try {
    _sentryClient.captureMessage(message, level);
  } catch {
    // Never let Sentry errors propagate
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Set the current user context for Sentry.
 *
 * No-op when Sentry is not configured.
 */
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
  if (!isSentryEnabled() || !_sentryClient) return;

  try {
    if (user) {
      _sentryClient.setUser(user);
    } else {
      _sentryClient.setUser(null);
    }
  } catch {
    // Never let Sentry errors propagate
  }
}

/**
 * Set a tag for filtering in Sentry.
 *
 * No-op when Sentry is not configured.
 */
export function setTag(key: string, value: string | number | boolean): void {
  if (!isSentryEnabled() || !_sentryClient) return;

  try {
    _sentryClient.setTag(key, value);
  } catch {
    // Never let Sentry errors propagate
  }
}

// ── Performance ───────────────────────────────────────────────────────────────

/**
 * Start a performance transaction.
 *
 * Returns a no-op transaction when Sentry is not configured.
 */
export function startTransaction(context: TransactionContext): SentryTransaction {
  if (!isSentryEnabled() || !_sentryClient) {
    return new NoOpTransaction();
  }

  try {
    const transaction = _sentryClient.startTransaction({
      name: context.name,
      op: context.op,
    });

    if (context.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        transaction.setTag(key, value);
      }
    }

    return {
      setTag: (key: string, value: string | number | boolean) => transaction.setTag(key, value),
      setData: (key: string, value: unknown) => transaction.setData(key, value),
      finish: () => transaction.finish(),
    };
  } catch {
    return new NoOpTransaction();
  }
}

// ── Request Context ───────────────────────────────────────────────────────────

/**
 * Extract request context from an HTTP request for Sentry enrichment.
 *
 * Adds method, path, and group_id (if present) as tags and extras.
 */
export function extractRequestContext(
  req: IncomingMessage
): CaptureContext {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  // Extract group_id from URL path or query string
  // Matches: ?group_id=xxx, /group_id/xxx, /group_id=xxx
  const groupIdMatch = url.match(/group_id[=\/\\]([a-zA-Z0-9-]+)/);
  const groupId = groupIdMatch?.[1];

  const tags: Record<string, string> = {
    "request.method": method,
    "request.path": url.split("?")[0],
  };

  Object.defineProperty(tags, "request", {
    value: {
      method,
      path: url.split("?")[0],
    },
    enumerable: false,
  });

  if (groupId) {
    tags["group_id"] = groupId;
  }

  const extra: Record<string, unknown> = {
    "request.url": url,
    "request.method": method,
  };

  if (groupId) {
    extra["group_id"] = groupId;
  }

  return { tags, extra };
}

// ── Reset (for testing) ──────────────────────────────────────────────────────

/**
 * Reset Sentry state. For testing only.
 */
export function resetSentry(): void {
  _sentryClient = null;
  _config = null;
  _initialized = false;
}
