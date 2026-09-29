/**
 * k6 Load Test — Allura Memory MCP HTTP Gateway
 *
 * Tests all major endpoints of the canonical HTTP gateway on port 3201.
 * Phase 9 benchmark: memory_add end-to-end latency < 200ms p95 at 100 concurrent agents.
 *
 * Usage:
 *   k6 run tests/load/k6-load-test.js
 *   BASE_URL=http://host:3201 ALLURA_MCP_AUTH_TOKEN=xxx k6 run tests/load/k6-load-test.js
 *
 * Or via runner:
 *   bun run load-test
 *
 * NOTE: k6 uses the Goja JS engine (ES5.1+). No trailing commas, no optional
 * chaining, no for...of Object.entries(). Keep syntax strict-ES5 compatible.
 */

import { check, sleep } from "k6";
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";

// ── Custom Metrics ────────────────────────────────────────────────────────────

const memoryAddDuration = new Trend("memory_add_duration", true);
const memorySearchDuration = new Trend("memory_search_duration", true);
const memoryGetDuration = new Trend("memory_get_duration", true);
const memoryListDuration = new Trend("memory_list_duration", true);
const mcpRequestDuration = new Trend("mcp_request_duration", true);
const errorRate = new Rate("errors");
var requestsTotal = new Counter("requests_total");

// ── Test Configuration ────────────────────────────────────────────────────────

export var options = {
  scenarios: {
    // Smoke test: 1 VU, 1 iteration — validates endpoints are reachable
    smoke: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      tags: { test_type: "smoke" },
      gracefulStop: "5s"
    },
    // Load test: ramp up to 100 VUs, hold, ramp down
    load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },   // Ramp up to 20
        { duration: "30s", target: 50 },   // Ramp up to 50
        { duration: "30s", target: 100 },  // Ramp up to 100 (Phase 9 target)
        { duration: "60s", target: 100 },  // Hold at 100 — sustained load
        { duration: "30s", target: 0 }     // Ramp down
      ],
      tags: { test_type: "load" },
      gracefulStop: "30s"
    }
  },
  thresholds: {
    // Phase 9 benchmark: memory_add p95 < 200ms
    memory_add_duration: ["p(95)<200", "avg<100"],
    // memory_search p95 < 500ms
    memory_search_duration: ["p(95)<500"],
    // General HTTP p95 < 500ms
    http_req_duration: ["p(95)<500"],
    // Error rate < 5%
    errors: ["rate<0.05"]
  }
};

// ── Environment ───────────────────────────────────────────────────────────────

var BASE_URL = __ENV.BASE_URL || "http://localhost:3201";
var AUTH_TOKEN = __ENV.ALLURA_MCP_AUTH_TOKEN || "";
var GROUP_ID = "allura-system-loadtest";

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Generate common request headers.
 */
function getHeaders(extra) {
  var headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  if (AUTH_TOKEN) {
    headers["Authorization"] = "Bearer " + AUTH_TOKEN;
  }
  if (extra) {
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) {
      headers[keys[i]] = extra[keys[i]];
    }
  }
  return headers;
}

/**
 * Generate a unique memory content string for testing.
 */
function generateMemoryContent(vuId, iter) {
  var timestamp = Date.now();
  var rand = Math.random().toString(36).substring(2, 10);
  return "Load test memory VU=" + vuId + " iter=" + iter + " ts=" + timestamp + " rnd=" + rand;
}

/**
 * Generate a unique user ID per VU to avoid collisions.
 */
function getUserId(vuId) {
  return "load-test-vu-" + vuId;
}

// ── MCP Streamable HTTP Helpers ──────────────────────────────────────────────

/**
 * Send an MCP tool call via the Streamable HTTP transport.
 * The MCP Streamable HTTP spec uses POST /mcp with JSON-RPC 2.0 messages.
 *
 * After session initialization, subsequent requests MUST include:
 * - Mcp-Session-Id header (if the server returned one during init)
 * - Mcp-Protocol-Version header (the version negotiated during init)
 *
 * @param {string} toolName - MCP tool name (e.g. "memory_search")
 * @param {object} args - Tool arguments
 * @param {number} requestId - JSON-RPC request ID
 * @param {object} [session] - Optional session state from mcpInitialize()
 *   { sessionId: string|null, protocolVersion: string }
 */
function mcpToolCall(toolName, args, requestId, session) {
  if (requestId === undefined) requestId = 1;
  if (!session) session = null;

  var payload = {
    jsonrpc: "2.0",
    id: requestId,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    }
  };

  // Build headers — include session and protocol headers if available
  var extraHeaders = {};
  if (session && session.protocolVersion) {
    extraHeaders["Mcp-Protocol-Version"] = session.protocolVersion;
  }
  if (session && session.sessionId) {
    extraHeaders["Mcp-Session-Id"] = session.sessionId;
  }

  var response = http.post(
    BASE_URL + "/mcp",
    JSON.stringify(payload),
    { headers: getHeaders(extraHeaders) }
  );

  mcpRequestDuration.add(response.timings.duration);
  return response;
}

/**
 * Initialize an MCP session (POST /mcp with initialize method).
 *
 * Per the MCP Streamable HTTP spec (2025-03-26):
 * 1. Client sends an "initialize" JSON-RPC request
 * 2. Server responds with capabilities + optional Mcp-Session-Id header
 * 3. Client sends a "notifications/initialized" notification to complete handshake
 * 4. Subsequent requests include Mcp-Session-Id and Mcp-Protocol-Version headers
 *
 * In stateless mode (sessionIdGenerator: undefined), the server may not
 * return a session ID. The test must handle this gracefully.
 *
 * @param {number} requestId - JSON-RPC request ID for the initialize call
 * @returns {{ response: object, sessionId: string|null, protocolVersion: string }}
 */
function mcpInitialize(requestId) {
  if (requestId === undefined) requestId = 0;

  var payload = {
    jsonrpc: "2.0",
    id: requestId,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "k6-load-test",
        version: "1.0.0"
      }
    }
  };

  var response = http.post(
    BASE_URL + "/mcp",
    JSON.stringify(payload),
    { headers: getHeaders() }
  );

  // Capture Mcp-Session-Id from response header (may be absent in stateless mode)
  var sessionId = response.headers["Mcp-Session-Id"] || null;

  // Extract negotiated protocol version from response body
  var protocolVersion = "2025-03-26"; // default to what we requested
  try {
    var body = JSON.parse(response.body);
    if (body && body.result && body.result.protocolVersion) {
      protocolVersion = body.result.protocolVersion;
    }
  } catch (e) {
    // If we can't parse, stick with the default
  }

  return { response: response, sessionId: sessionId, protocolVersion: protocolVersion };
}

/**
 * Send the "notifications/initialized" notification to complete the MCP handshake.
 * This is required after receiving the initialize response before making tool calls.
 *
 * Per the MCP spec, notifications have no "id" field and receive no response.
 * The server returns 202 Accepted for notification-only requests.
 *
 * @param {object} session - Session state from mcpInitialize()
 *   { sessionId: string|null, protocolVersion: string }
 */
function mcpInitialized(session) {
  // Notifications have no "id" field — they are fire-and-forget
  var payload = {
    jsonrpc: "2.0",
    method: "notifications/initialized"
  };

  // Include protocol version header if available (required after init)
  var extraHeaders = {};
  if (session.protocolVersion) {
    extraHeaders["Mcp-Protocol-Version"] = session.protocolVersion;
  }
  if (session.sessionId) {
    extraHeaders["Mcp-Session-Id"] = session.sessionId;
  }

  var response = http.post(
    BASE_URL + "/mcp",
    JSON.stringify(payload),
    { headers: getHeaders(extraHeaders) }
  );

  return response;
}

// ── MCP Tool Call Helpers ──────────────────────────────────────────────────────

/**
 * Call a tool via the MCP Streamable HTTP endpoint.
 */
function mcpToolCall(toolName, args) {
  var payload = {
    jsonrpc: "2.0",
    id: __VU + "-" + __ITER + "-" + toolName,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    }
  };

  return http.post(
    BASE_URL + "/mcp",
    JSON.stringify(payload),
    { headers: getHeaders() }
  );
}

// ── Test Functions ────────────────────────────────────────────────────────────

/**
 * Test health endpoint — should always return 200.
 */
function testHealth() {
  var response = http.get(BASE_URL + "/health");
  var passed = check(response, {
    "health status is 200": function(r) { return r.status === 200; },
    "health body has status": function(r) {
      try {
        var body = JSON.parse(r.body);
        return body.status === "healthy";
      } catch (e) {
        return false;
      }
    },
    "health body has transports": function(r) {
      try {
        var body = JSON.parse(r.body);
        return Array.isArray(body.transports);
      } catch (e) {
        return false;
      }
    }
  });

  if (!passed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);
  return passed;
}

/**
 * Test readiness probe — checks PostgreSQL (episodic + RuVector).
 */
function testReadiness() {
  var response = http.get(BASE_URL + "/api/ready");
  var passed = check(response, {
    "readiness status is 200 or 503": function(r) { return r.status === 200 || r.status === 503; },
    "readiness body has ready field": function(r) {
      try {
        var body = JSON.parse(r.body);
        return typeof body.ready === "boolean";
      } catch (e) {
        return false;
      }
    }
  });

  if (!passed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);
  return passed;
}

/**
 * Test liveness probe — simple process heartbeat.
 */
function testLiveness() {
  var response = http.get(BASE_URL + "/api/live");
  var passed = check(response, {
    "liveness status is 200": function(r) { return r.status === 200; },
    "liveness body has alive=true": function(r) {
      try {
        var body = JSON.parse(r.body);
        return body.alive === true;
      } catch (e) {
        return false;
      }
    }
  });

  if (!passed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);
  return passed;
}

/**
 * Test Prometheus metrics endpoint.
 */
function testMetrics() {
  var response = http.get(BASE_URL + "/api/metrics", { headers: getHeaders() });
  var passed = check(response, {
    "metrics status is 200 or 401": function(r) { return r.status === 200 || r.status === 401; }
  });

  // If auth is required and we have a token, verify we get metrics
  if (AUTH_TOKEN && response.status === 200) {
    var hasContent = check(response, {
      "metrics has content": function(r) { return r.body && r.body.length > 0; }
    });
    if (!hasContent) errorRate.add(1);
  }

  requestsTotal.add(1);
  return passed;
}

/**
 * Test memory_add via MCP Streamable HTTP — the Phase 9 benchmark target.
 * Records custom metric: memory_add_duration.
 */
function testMemoryAdd(vuId, iter) {
  var content = generateMemoryContent(vuId, iter);
  var userId = getUserId(vuId);

  var args = {
    group_id: GROUP_ID,
    user_id: userId,
    content: content,
    metadata: {
      source: "manual",
      agent_id: "k6-vu-" + vuId
    }
  };

  var startTime = Date.now();
  var response = mcpToolCall("memory_add", args);
  var duration = Date.now() - startTime;

  memoryAddDuration.add(duration);

  var passed = check(response, {
    "memory_add status is 200": function(r) { return r.status === 200; },
    "memory_add returns result": function(r) {
      try {
        var body = JSON.parse(r.body);
        // Result may be wrapped in { content: [...] } or returned directly
        return body !== null && body !== undefined;
      } catch (e) {
        return false;
      }
    }
  });

  if (!passed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);

  // Extract memory ID for subsequent get/delete operations
  var memoryId = null;
  try {
    var body = JSON.parse(response.body);
    // Handle both direct result and MCP-wrapped result
    if (body.id) {
      memoryId = body.id;
    } else if (body.content && Array.isArray(body.content)) {
      var textContent = null;
      for (var i = 0; i < body.content.length; i++) {
        if (body.content[i].type === "text") {
          textContent = body.content[i];
          break;
        }
      }
      if (textContent) {
        var parsed = JSON.parse(textContent.text);
        memoryId = parsed.id || parsed.memory_id || null;
      }
    }
  } catch (e) {
    // Non-critical — ID extraction is best-effort
  }

  return { passed: passed, memoryId: memoryId, content: content };
}

/**
 * Test memory_search via MCP Streamable HTTP.
 * Records custom metric: memory_search_duration.
 */
function testMemorySearch(vuId, iter) {
  var userId = getUserId(vuId);

  var args = {
    query: "load test VU=" + vuId,
    group_id: GROUP_ID,
    user_id: userId,
    limit: 5
  };

  var startTime = Date.now();
  var response = mcpToolCall("memory_search", args);
  var duration = Date.now() - startTime;

  memorySearchDuration.add(duration);

  var passed = check(response, {
    "memory_search status is 200": function(r) { return r.status === 200; },
    "memory_search returns results": function(r) {
      try {
        var body = JSON.parse(r.body);
        return body !== null && body !== undefined;
      } catch (e) {
        return false;
      }
    }
  });

  if (!passed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);
  return passed;
}

/**
 * Test memory_get via MCP Streamable HTTP.
 * Records custom metric: memory_get_duration.
 */
function testMemoryGet(memoryId) {
  if (!memoryId) return true; // Skip if no ID available

  var args = {
    id: memoryId,
    group_id: GROUP_ID
  };

  var startTime = Date.now();
  var response = mcpToolCall("memory_get", args);
  var duration = Date.now() - startTime;

  memoryGetDuration.add(duration);

  var passed = check(response, {
    "memory_get status is 200": function(r) { return r.status === 200; }
  });

  if (!passed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);
  return passed;
}

/**
 * Test memory_list via MCP Streamable HTTP.
 * Records custom metric: memory_list_duration.
 */
function testMemoryList(vuId) {
  var userId = getUserId(vuId);

  var args = {
    group_id: GROUP_ID,
    user_id: userId,
    limit: 10
  };

  var startTime = Date.now();
  var response = mcpToolCall("memory_list", args);
  var duration = Date.now() - startTime;

  memoryListDuration.add(duration);

  var passed = check(response, {
    "memory_list status is 200": function(r) { return r.status === 200; }
  });

  if (!passed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);
  return passed;
}

/**
 * Test MCP Streamable HTTP endpoint using proper handshake protocol.
 *
 * The MCP Streamable HTTP spec requires:
 * 1. POST initialize request → server responds with capabilities + session ID
 * 2. POST notifications/initialized → completes the handshake (server returns 202)
 * 3. POST tools/call (or other requests) with session/protocol headers
 *
 * In stateless mode, the server may not return a session ID.
 * If the server is misconfigured or the handshake fails, the test degrades
 * gracefully rather than hard-failing — this allows the rest of the load
 * test to continue validating legacy endpoints.
 */
function testMcpStreamableHttp(vuId, iter) {
  // Step 1: Initialize MCP session
  var initResult = mcpInitialize(iter * 1000 + vuId);
  var session = {
    sessionId: initResult.sessionId,
    protocolVersion: initResult.protocolVersion
  };

  var initPassed = check(initResult.response, {
    "mcp initialize status is 200": function(r) { return r.status === 200; }
  });

  if (!initPassed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);

  // Step 1b: Send notifications/initialized to complete the handshake
  // Even if init failed, we still attempt the full sequence to collect
  // diagnostic data and to verify the complete protocol flow.
  var notifResponse = mcpInitialized(session);
  // Servers should return 202 for notification-only requests, but some
  // implementations return 200. Both are acceptable.
  var notifOk = notifResponse.status === 200 || notifResponse.status === 202;
  if (!notifOk) {
    // Log but don't fail — some servers may not handle standalone notifications
    // and we still want to attempt the tool call
    console.warn(
      "MCP initialized notification returned " + notifResponse.status +
      " (expected 200 or 202). Session ID: " + (session.sessionId || "none")
    );
  }
  requestsTotal.add(1);

  // Step 2: Call memory_search via MCP protocol with session headers
  var searchArgs = {
    query: "mcp test VU=" + vuId,
    group_id: GROUP_ID,
    limit: 3
  };

  var callResponse = mcpToolCall(
    "memory_search",
    searchArgs,
    iter * 1000 + vuId + 1,
    session
  );

  var callPassed = check(callResponse, {
    "mcp tool call status is 200": function(r) { return r.status === 200; }
  });

  if (!callPassed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);

  return initPassed && callPassed;
}

/**
 * Test curator proposals endpoint.
 */
function testCuratorProposals() {
  var response = http.get(
    BASE_URL + "/api/curator/proposals?group_id=" + GROUP_ID,
    { headers: getHeaders() }
  );

  var passed = check(response, {
    "curator proposals status is 200 or 404": function(r) { return r.status === 200 || r.status === 404; }
  });

  if (!passed) {
    errorRate.add(1);
  }
  requestsTotal.add(1);
  return passed;
}

// ── Main Test Function ────────────────────────────────────────────────────────

export default function () {
  var vuId = __VU;
  var iter = __ITER;

  // ── Phase 1: Health & Probes (every iteration) ────────────────────────────
  testHealth();
  sleep(0.1);

  testLiveness();
  sleep(0.1);

  // Readiness check (includes DB checks — less frequent to avoid overload)
  if (iter % 5 === 0) {
    testReadiness();
  }

  // ── Phase 2: Memory Operations (primary benchmark) ───────────────────────
  // memory_add is the Phase 9 benchmark target: p95 < 200ms at 100 VUs
  var addResult = testMemoryAdd(vuId, iter);
  sleep(0.05);

  // memory_search after add — tests federated search
  testMemorySearch(vuId, iter);
  sleep(0.05);

  // memory_get — if we got an ID back
  testMemoryGet(addResult.memoryId);
  sleep(0.05);

  // memory_list — list user's memories
  testMemoryList(vuId);
  sleep(0.05);

  // ── Phase 3: MCP Streamable HTTP (every 3rd iteration) ───────────────────
  if (iter % 3 === 0) {
    testMcpStreamableHttp(vuId, iter);
  }

  // ── Phase 4: Metrics & Curator (every 10th iteration) ────────────────────
  if (iter % 10 === 0) {
    testMetrics();
    testCuratorProposals();
  }

  // Brief pause between iterations to simulate realistic agent behavior
  sleep(0.5);
}

// ── Setup & Teardown ──────────────────────────────────────────────────────────

export function setup() {
  console.log("Allura Memory Load Test");
  console.log("========================");
  console.log("Base URL: " + BASE_URL);
  console.log("Auth: " + (AUTH_TOKEN ? "Bearer token configured" : "No auth token (dev mode)"));
  console.log("Group ID: " + GROUP_ID);
  console.log("");

  // Verify server is reachable before starting
  var healthResponse = http.get(BASE_URL + "/health");
  if (healthResponse.status !== 200) {
    console.error("Server health check failed: " + healthResponse.status);
    console.error("Make sure the server is running at " + BASE_URL);
    // Don't fail setup — let the test run and report failures
  } else {
    console.log("Server is healthy. Starting load test...");
  }

  return { startTime: Date.now() };
}

export function teardown(data) {
  var duration = ((Date.now() - data.startTime) / 1000).toFixed(1);
  console.log("");
  console.log("Load test completed in " + duration + "s");
  console.log("");
  console.log("Phase 9 Benchmark Thresholds:");
  console.log("  memory_add p95 < 200ms");
  console.log("  memory_search p95 < 500ms");
  console.log("  General HTTP p95 < 500ms");
  console.log("  Error rate < 5%");
  console.log("");
  console.log("Check k6 output above for threshold results.");
}

// ── Handle Summary ────────────────────────────────────────────────────────────

export function handleSummary(data) {
  var summary = {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
    "tests/load/results/summary.json": JSON.stringify(data, null, 2)
  };

  // Also write a human-readable report
  var report = generateReport(data);
  summary["tests/load/results/load-test-report.txt"] = report;

  return summary;
}

function textSummary(data, options) {
  // Use k6's built-in summary if available, otherwise generate our own
  if (typeof __ENV !== "undefined") {
    // k6 will handle the default summary output
    return "";
  }
  return JSON.stringify(data, null, 2);
}

function getMetricValue(values, key) {
  if (!values) return "N/A";
  var v = values[key];
  if (v === undefined || v === null) return "N/A";
  return v.toFixed(2);
}

function generateReport(data) {
  var lines = [];
  lines.push("Allura Memory Load Test Report");
  lines.push("================================");
  lines.push("Date: " + new Date().toISOString());
  lines.push("Base URL: " + BASE_URL);
  lines.push("Group ID: " + GROUP_ID);
  lines.push("");

  // HTTP metrics
  if (data.metrics && data.metrics.http_req_duration) {
    var httpDur = data.metrics.http_req_duration;
    lines.push("HTTP Request Duration:");
    lines.push("  avg: " + getMetricValue(httpDur.values, "avg") + "ms");
    lines.push("  p95: " + getMetricValue(httpDur.values, "p(95)") + "ms");
    lines.push("  p99: " + getMetricValue(httpDur.values, "p(99)") + "ms");
    lines.push("");
  }

  // Custom metrics
  if (data.metrics && data.metrics.memory_add_duration) {
    var addDur = data.metrics.memory_add_duration;
    lines.push("Memory Add Duration (Phase 9 Benchmark):");
    lines.push("  avg: " + getMetricValue(addDur.values, "avg") + "ms");
    lines.push("  p95: " + getMetricValue(addDur.values, "p(95)") + "ms");
    lines.push("  p99: " + getMetricValue(addDur.values, "p(99)") + "ms");
    lines.push("  THRESHOLD: p95 < 200ms");
    lines.push("");
  }

  if (data.metrics && data.metrics.memory_search_duration) {
    var searchDur = data.metrics.memory_search_duration;
    lines.push("Memory Search Duration:");
    lines.push("  avg: " + getMetricValue(searchDur.values, "avg") + "ms");
    lines.push("  p95: " + getMetricValue(searchDur.values, "p(95)") + "ms");
    lines.push("");
  }

  // Threshold results — use ES5-compatible iteration
  if (data.thresholds) {
    lines.push("Threshold Results:");
    var keys = Object.keys(data.thresholds);
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      var result = data.thresholds[name];
      lines.push("  " + name + ": " + (result.ok ? "PASS" : "FAIL"));
    }
    lines.push("");
  }

  return lines.join("\n");
}
