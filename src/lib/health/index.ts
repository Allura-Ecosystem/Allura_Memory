/**
 * Health Module — Public API
 *
 * Provides health probes and Prometheus metrics for Allura Memory.
 *
 * Endpoints:
 * - /ready  → Readiness probe (checks PostgreSQL, MCP)
 * - /live   → Liveness probe (process heartbeat)
 * - /metrics → Prometheus exposition format metrics
 */

export { checkReadiness, markMcpInitialized, type ReadinessResult, type LivenessResult, type DependencyCheck } from "./probes";
export { collectMetrics, recordHttpRequest, recordMemoryAdd, recordMemorySearch, recordWatchdogCycle, recordProposalCreated, recordProposalApproved, recordProposalRejected, recordBudgetRemaining, ensureMetricsInitialized } from "./metrics";
export { MetricsRegistry, metricsRegistry, registerStandardMetrics } from "./metrics-registry";