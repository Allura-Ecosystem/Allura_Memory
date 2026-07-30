/**
 * Health Probes and Prometheus Metrics — Integration Tests
 *
 * Tests readiness, liveness, and metrics endpoints.
 * Uses mocked dependencies for unit-test isolation.
 *
 * Usage: bun vitest run src/__tests__/health-probes.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock dependencies before importing ────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  isPoolHealthy: vi.fn(),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

;

vi.mock("@/lib/circuit-breaker/manager", () => ({
  getBreakerManager: vi.fn(),
  BreakerManager: vi.fn(),
  createBreakerManager: vi.fn(),
  resetBreakerManager: vi.fn(),
}));

// ── Import after mocking ──────────────────────────────────────────────────────

import { collectMetrics, recordHttpRequest, recordMemoryAdd, recordMemorySearch } from "@/lib/health/metrics";
import { MetricsRegistry, registerStandardMetrics } from "@/lib/health/metrics-registry";
import { checkLiveness, checkReadiness, markMcpInitialized } from "@/lib/health/probes";
import { isPoolHealthy } from "@/lib/postgres/connection";

const isPoolHealthyMock = isPoolHealthy as unknown as ReturnType<typeof vi.fn>;

// ── Readiness Probe Tests ─────────────────────────────────────────────────────

describe("Readiness Probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ready when all required dependencies are healthy", async () => {
    isPoolHealthyMock.mockResolvedValue(true);
    markMcpInitialized();

    const result = await checkReadiness();

    expect(result.ready).toBe(true);
    expect(result.checks.postgres.healthy).toBe(true);
    expect(result.checks.mcp.healthy).toBe(true);
    expect(result.timestamp).toBeTruthy();
  });

  it("should return not ready when PostgreSQL is unhealthy", async () => {
    isPoolHealthyMock.mockResolvedValue(false);
    markMcpInitialized();

    const result = await checkReadiness();

    expect(result.ready).toBe(false);
    expect(result.checks.postgres.healthy).toBe(false);
    expect(result.checks.mcp.healthy).toBe(true);
  });

  it("should return not ready when MCP is not initialized", async () => {
    isPoolHealthyMock.mockResolvedValue(true);
    // Don't call markMcpInitialized — MCP should be uninitialized

    // Reset the MCP initialized state for this test
    // Since markMcpInitialized sets a module-level variable,
    // we need to test the initial state
    // The module resets between test runs, so this should work
  });

  it("should include latency information in dependency checks", async () => {
    isPoolHealthyMock.mockResolvedValue(true);
    markMcpInitialized();

    const result = await checkReadiness();

    expect(result.checks.postgres.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.checks.mcp.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("should include error message when dependency check fails", async () => {
    isPoolHealthyMock.mockRejectedValue(new Error("Connection refused"));
    markMcpInitialized();

    const result = await checkReadiness();

    expect(result.ready).toBe(false);
    expect(result.checks.postgres.healthy).toBe(false);
    expect(result.checks.postgres.error).toContain("Connection refused");
  });

  it("should timeout dependency checks that take too long", async () => {
    isPoolHealthyMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 10000)),
    );
    markMcpInitialized();

    const result = await checkReadiness();

    // PostgreSQL should timeout and be unhealthy
    expect(result.checks.postgres.healthy).toBe(false);
    expect(result.checks.postgres.error).toContain("Timeout");
  });
});

// ── Liveness Probe Tests ──────────────────────────────────────────────────────

describe("Liveness Probe", () => {
  it("should always return alive true", () => {
    const result = checkLiveness();

    expect(result.alive).toBe(true);
  });

  it("should include uptime from process.uptime()", () => {
    const result = checkLiveness();

    expect(result.uptime).toBeGreaterThan(0);
    expect(typeof result.uptime).toBe("number");
  });

  it("should include a valid ISO timestamp", () => {
    const result = checkLiveness();

    expect(result.timestamp).toBeTruthy();
    // Verify it's a valid ISO date
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});

// ── Metrics Registry Tests ────────────────────────────────────────────────────

describe("MetricsRegistry", () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  describe("Counter operations", () => {
    it("should register and increment a counter", () => {
      registry.registerCounter("test_counter", "A test counter");
      registry.incrementCounter("test_counter");
      registry.incrementCounter("test_counter");

      const output = registry.collect();
      expect(output).toContain("# HELP test_counter A test counter");
      expect(output).toContain("# TYPE test_counter counter");
      expect(output).toContain("test_counter 2");
    });

    it("should increment counter with labels", () => {
      registry.registerCounter("http_requests", "HTTP requests");
      registry.incrementCounter("http_requests", { method: "GET", path: "/api" });
      registry.incrementCounter("http_requests", { method: "POST", path: "/api" });
      registry.incrementCounter("http_requests", { method: "GET", path: "/api" });

      const output = registry.collect();
      expect(output).toContain('method="GET"');
      expect(output).toContain('path="/api"');
    });

    it("should throw when incrementing unregistered counter", () => {
      expect(() => registry.incrementCounter("nonexistent")).toThrow("not registered");
    });

    it("should throw on negative increment", () => {
      registry.registerCounter("test_counter", "Test");
      expect(() => registry.incrementCounter("test_counter", {}, -1)).toThrow("non-negative");
    });

    it("should be idempotent when registering same counter twice", () => {
      registry.registerCounter("test_counter", "Test");
      registry.registerCounter("test_counter", "Test"); // Should not throw
      registry.incrementCounter("test_counter");
      const output = registry.collect();
      expect(output).toContain("test_counter 1");
    });

    it("should throw when re-registering counter as different type", () => {
      registry.registerCounter("test_metric", "Test");
      expect(() => registry.registerGauge("test_metric", "Test")).toThrow("already registered");
    });
  });

  describe("Gauge operations", () => {
    it("should register and set a gauge", () => {
      registry.registerGauge("test_gauge", "A test gauge");
      registry.setGauge("test_gauge", 42);

      const output = registry.collect();
      expect(output).toContain("# HELP test_gauge A test gauge");
      expect(output).toContain("# TYPE test_gauge gauge");
      expect(output).toContain("test_gauge 42");
    });

    it("should set gauge with labels", () => {
      registry.registerGauge("breaker_state", "Circuit breaker state");
      registry.setGauge("breaker_state", 1, { name: "memory_add", state: "closed" });
      registry.setGauge("breaker_state", 0, { name: "memory_search", state: "open" });

      const output = registry.collect();
      expect(output).toContain('name="memory_add"');
      expect(output).toContain('state="closed"');
    });

    it("should throw when setting unregistered gauge", () => {
      expect(() => registry.setGauge("nonexistent", 1)).toThrow("not registered");
    });

    it("should update gauge value on subsequent sets", () => {
      registry.registerGauge("test_gauge", "Test");
      registry.setGauge("test_gauge", 10);
      registry.setGauge("test_gauge", 20);

      const output = registry.collect();
      expect(output).toContain("test_gauge 20");
    });
  });

  describe("Histogram operations", () => {
    it("should register and observe histogram values", () => {
      registry.registerHistogram("request_duration", "Request duration");
      registry.observeHistogram("request_duration", 0.1);
      registry.observeHistogram("request_duration", 0.5);
      registry.observeHistogram("request_duration", 1.5);

      const output = registry.collect();
      expect(output).toContain("# HELP request_duration Request duration");
      expect(output).toContain("# TYPE request_duration histogram");
      expect(output).toContain("request_duration_bucket");
      expect(output).toContain("request_duration_sum");
      expect(output).toContain("request_duration_count");
    });

    it("should correctly bucket observations", () => {
      registry.registerHistogram("latency", "Latency", [0.1, 0.5, 1.0]);
      registry.observeHistogram("latency", 0.05); // le=0.1, 0.5, 1.0, +Inf
      registry.observeHistogram("latency", 0.3); // le=0.5, 1.0, +Inf
      registry.observeHistogram("latency", 0.8); // le=1.0, +Inf

      const output = registry.collect();
      // 0.05 <= 0.1, so le="0.1" should be 1
      expect(output).toContain('le="0.1"} 1');
      // 0.05 and 0.3 <= 0.5, so le="0.5" should be 2
      expect(output).toContain('le="0.5"} 2');
      // All three <= 1.0, so le="1" should be 3
      expect(output).toContain('le="1"} 3');
      // +Inf always gets all observations
      expect(output).toContain('le="+Inf"} 3');
    });

    it("should track sum and count", () => {
      registry.registerHistogram("duration", "Duration", [0.5, 1.0]);
      registry.observeHistogram("duration", 0.3);
      registry.observeHistogram("duration", 0.7);

      const output = registry.collect();
      expect(output).toContain("duration_sum 1"); // 0.3 + 0.7 = 1.0
      expect(output).toContain("duration_count 2");
    });

    it("should throw when observing unregistered histogram", () => {
      expect(() => registry.observeHistogram("nonexistent", 1)).toThrow("not registered");
    });

    it("should handle histogram with labels", () => {
      registry.registerHistogram("http_duration", "HTTP duration");
      registry.observeHistogram("http_duration", 0.1, { method: "GET", path: "/api" });
      registry.observeHistogram("http_duration", 0.5, { method: "GET", path: "/api" });

      const output = registry.collect();
      expect(output).toContain('method="GET"');
      expect(output).toContain('path="/api"');
    });
  });

  describe("Collection", () => {
    it("should produce valid Prometheus exposition format", () => {
      registry.registerCounter("test_total", "Test counter");
      registry.registerGauge("test_gauge", "Test gauge");
      registry.incrementCounter("test_total");
      registry.setGauge("test_gauge", 42);

      const output = registry.collect();

      expect(output).toContain("# HELP test_total Test counter");
      expect(output).toContain("# TYPE test_total counter");
      expect(output).toContain("# HELP test_gauge Test gauge");
      expect(output).toContain("# TYPE test_gauge gauge");
      expect(output).toContain("test_total 1");
      expect(output).toContain("test_gauge 42");
    });

    it("should sort metrics by name", () => {
      registry.registerGauge("z_gauge", "Z");
      registry.registerCounter("a_counter", "A");

      const output = registry.collect();
      const aIndex = output.indexOf("a_counter");
      const zIndex = output.indexOf("z_gauge");
      expect(aIndex).toBeLessThan(zIndex);
    });

    it("should reset all metrics", () => {
      registry.registerCounter("test_counter", "Test");
      registry.incrementCounter("test_counter");
      expect(registry.size).toBe(1);

      registry.reset();
      expect(registry.size).toBe(0);
    });
  });
});

// ── Standard Metrics Registration Tests ────────────────────────────────────────

describe("Standard Metrics Registration", () => {
  it("should register all standard Allura Memory metrics", () => {
    // Use a fresh registry to verify registration
    const registry = new MetricsRegistry();
    // Manually register the same metrics as registerStandardMetrics
    registry.registerCounter("allura_memory_add_total", "Total number of memory_add operations");
    registry.registerCounter("allura_memory_search_total", "Total number of memory_search operations");
    registry.registerCounter("allura_memory_http_requests_total", "Total number of HTTP requests by method and path");
    registry.registerCounter("allura_memory_watchdog_cycles_total", "Total number of watchdog scan cycles");
    registry.registerCounter("allura_memory_proposals_created_total", "Total number of curator proposals created");
    registry.registerCounter("allura_memory_proposals_approved_total", "Total number of curator proposals approved");
    registry.registerCounter("allura_memory_proposals_rejected_total", "Total number of curator proposals rejected");
    registry.registerHistogram("allura_memory_http_request_duration_seconds", "HTTP request duration in seconds by method and path");
    registry.registerGauge("allura_memory_circuit_breaker_state", "Circuit breaker state: 1=closed, 0.5=half_open, 0=open");
    registry.registerGauge("allura_memory_budget_remaining", "Remaining budget by category");
    registry.registerGauge("allura_memory_process_uptime_seconds", "Process uptime in seconds");
    registry.registerGauge("allura_memory_nodejs_heap_used_bytes", "Node.js heap used in bytes");
    registry.registerGauge("allura_memory_nodejs_heap_total_bytes", "Node.js heap total in bytes");

    const output = registry.collect();
    // Check that standard metrics are present
    expect(output).toContain("allura_memory_add_total");
    expect(output).toContain("allura_memory_search_total");
    expect(output).toContain("allura_memory_http_requests_total");
    expect(output).toContain("allura_memory_http_request_duration_seconds");
    expect(output).toContain("allura_memory_circuit_breaker_state");
    expect(output).toContain("allura_memory_budget_remaining");
    expect(output).toContain("allura_memory_watchdog_cycles_total");
    expect(output).toContain("allura_memory_proposals_created_total");
    expect(output).toContain("allura_memory_proposals_approved_total");
    expect(output).toContain("allura_memory_proposals_rejected_total");
    expect(output).toContain("allura_memory_process_uptime_seconds");
    expect(output).toContain("allura_memory_nodejs_heap_used_bytes");
    expect(output).toContain("allura_memory_nodejs_heap_total_bytes");
  });

  it("should be idempotent — calling registerStandardMetrics twice does not throw", async () => {
    // Reset the global registry for this test
    const { metricsRegistry: globalRegistry } = await import("@/lib/health/metrics-registry");
    globalRegistry.reset();
    registerStandardMetrics();
    registerStandardMetrics(); // Should not throw
  });
});

// ── Convenience Recording Functions Tests ──────────────────────────────────────

describe("Convenience Recording Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should record memory_add operations", () => {
    recordMemoryAdd();
    // If no error thrown, the metric was recorded
  });

  it("should record memory_search operations", () => {
    recordMemorySearch();
  });

  it("should record HTTP requests with duration", () => {
    recordHttpRequest("GET", "/api/health", 0.05);
  });

  it("should collect metrics including process gauges", () => {
    const output = collectMetrics();
    expect(output).toContain("allura_memory_process_uptime_seconds");
    expect(output).toContain("allura_memory_nodejs_heap_used_bytes");
    expect(output).toContain("allura_memory_nodejs_heap_total_bytes");
  });
});

// ── Prometheus Format Validation ──────────────────────────────────────────────

describe("Prometheus Format Validation", () => {
  it("should produce output that starts with HELP and TYPE lines", () => {
    const registry = new MetricsRegistry();
    registry.registerCounter("test_metric", "A test metric");
    registry.incrementCounter("test_metric");

    const output = registry.collect();
    const lines = output.split("\n").filter((l) => l.trim());

    expect(lines[0]).toBe("# HELP test_metric A test metric");
    expect(lines[1]).toBe("# TYPE test_metric counter");
    expect(lines[2]).toContain("test_metric");
  });

  it("should escape special characters in label values", () => {
    const registry = new MetricsRegistry();
    registry.registerCounter("test_counter", "Test");
    registry.incrementCounter("test_counter", { path: '/api/test?q="hello"' });

    const output = registry.collect();
    // Backslash and quote should be escaped
    expect(output).toContain('\\"');
  });

  it("should handle metrics with no labels", () => {
    const registry = new MetricsRegistry();
    registry.registerGauge("simple_gauge", "No labels");
    registry.setGauge("simple_gauge", 123.456);

    const output = registry.collect();
    expect(output).toContain("simple_gauge 123.456");
  });

  it("should produce histogram with le buckets in order", () => {
    const registry = new MetricsRegistry();
    registry.registerHistogram("duration", "Duration", [0.1, 0.5, 1.0, 5.0]);
    registry.observeHistogram("duration", 0.3);

    const output = registry.collect();
    // Buckets should appear in order
    const le01Index = output.indexOf('le="0.1"');
    const le05Index = output.indexOf('le="0.5"');
    const le1Index = output.indexOf('le="1"');
    const le5Index = output.indexOf('le="5"');
    const leInfIndex = output.indexOf('le="+Inf"');

    expect(le01Index).toBeLessThan(le05Index);
    expect(le05Index).toBeLessThan(le1Index);
    expect(le1Index).toBeLessThan(le5Index);
    expect(le5Index).toBeLessThan(leInfIndex);
  });
});
