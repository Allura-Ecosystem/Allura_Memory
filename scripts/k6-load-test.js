/**
 * k6 Load Test Configuration — Allura Memory MCP Gateway
 *
 * Phase 9 benchmark: memory_add < 200ms p95 at 100 concurrent agents.
 *
 * Usage:
 *   k6 run scripts/k6-load-test.js
 *   k6 run --vus 100 --duration 5m scripts/k6-load-test.js
 *
 * Prerequisites:
 *   - k6 installed (https://k6.io/docs/get-k6/)
 *   - Allura Memory running on localhost:3201
 *   - ALLURA_MCP_AUTH_TOKEN set if auth is enabled
 */

import { check, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.ALLURA_BASE_URL || "http://localhost:3201";
const AUTH_TOKEN = __ENV.ALLURA_MCP_AUTH_TOKEN || "";

// ── Custom Metrics ─────────────────────────────────────────────────────────────

const addLatency = new Trend("memory_add_latency", true);
const searchLatency = new Trend("memory_search_latency", true);
const getLatency = new Trend("memory_get_latency", true);
const listLatency = new Trend("memory_list_latency", true);
const errorRate = new Rate("errors");

// ── Load Options ───────────────────────────────────────────────────────────────

export const options = {
  // Phase 9 benchmark: 100 concurrent agents
  stages: [
    { duration: "30s", target: 20 },   // Ramp up to 20 VUs
    { duration: "1m", target: 50 },    // Ramp up to 50 VUs
    { duration: "2m", target: 100 },   // Ramp up to 100 VUs (target)
    { duration: "2m", target: 100 },  // Sustain at 100 VUs
    { duration: "30s", target: 0 },    // Ramp down
  ],
  thresholds: {
    // Phase 9 benchmark targets
    http_req_duration: ["p(95)<200"],     // p95 < 200ms overall
    memory_add_latency: ["p(95)<200"],    // memory_add p95 < 200ms
    memory_search_latency: ["p(95)<500"], // memory_search p95 < 500ms
    memory_get_latency: ["p(95)<100"],    // memory_get p95 < 100ms
    memory_list_latency: ["p(95)<100"],    // memory_list p95 < 100ms
    errors: ["rate<0.01"],                // Error rate < 1%
  },
};

// ── Helper Functions ──────────────────────────────────────────────────────────

function getHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };
  if (AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

function generateGroupId() {
  return `allura-k6-test-${__VU}`;
}

function generateContent() {
  const verbs = ["prefers", "always uses", "recommends", "dislikes", "avoids"];
  const nouns = ["TypeScript", "React", "Next.js", "Bun", "RuVector", "PostgreSQL", "Docker", "Kubernetes"];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `I ${verb} ${noun} for all memory operations`;
}

// ── Test Scenarios ─────────────────────────────────────────────────────────────

export default function () {
  const headers = getHeaders();
  const groupId = generateGroupId();
  const userId = `k6-user-${__VU}`;

  // ── Scenario 1: memory_add (most critical — Phase 9 benchmark) ────────────

  const addPayload = JSON.stringify({
    jsonrpc: "2.0",
    id: `${__VU}-add-${Date.now()}`,
    method: "tools/call",
    params: {
      name: "memory_add",
      arguments: {
        group_id: groupId,
        user_id: userId,
        content: generateContent(),
        tier: "emerging",
      },
    },
  });

  const addStart = Date.now();
  const addRes = http.post(`${BASE_URL}/mcp`, addPayload, { headers });
  const addDuration = Date.now() - addStart;

  addLatency.add(addDuration);

  check(addRes, {
    "memory_add status 200": (r) => r.status === 200,
    "memory_add has result": (r) => {
      try {
        const body = JSON.parse(r.body);
        const text = body?.result?.content?.[0]?.text;
        if (!text) return false;
        const parsed = JSON.parse(text);
        return parsed.id !== undefined || parsed.stored !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (addRes.status !== 200) {
    errorRate.add(1);
  }

  // ── Scenario 2: memory_search ─────────────────────────────────────────────

  const searchPayload = JSON.stringify({
    jsonrpc: "2.0",
    id: `${__VU}-search-${Date.now()}`,
    method: "tools/call",
    params: {
      name: "memory_search",
      arguments: {
        group_id: groupId,
        query: "TypeScript preferences",
      },
    },
  });

  const searchStart = Date.now();
  const searchRes = http.post(`${BASE_URL}/mcp`, searchPayload, { headers });
  const searchDuration = Date.now() - searchStart;

  searchLatency.add(searchDuration);

  check(searchRes, {
    "memory_search status 200": (r) => r.status === 200,
  });

  if (searchRes.status !== 200) {
    errorRate.add(1);
  }

  // ── Scenario 3: memory_list ───────────────────────────────────────────────

  const listPayload = JSON.stringify({
    jsonrpc: "2.0",
    id: `${__VU}-list-${Date.now()}`,
    method: "tools/call",
    params: {
      name: "memory_list",
      arguments: {
        group_id: groupId,
        user_id: userId,
        limit: 10,
      },
    },
  });

  const listStart = Date.now();
  const listRes = http.post(`${BASE_URL}/mcp`, listPayload, { headers });
  const listDuration = Date.now() - listStart;

  listLatency.add(listDuration);

  check(listRes, {
    "memory_list status 200": (r) => r.status === 200,
  });

  if (listRes.status !== 200) {
    errorRate.add(1);
  }

  // ── Scenario 4: Health check ─────────────────────────────────────────────

  const healthRes = http.get(`${BASE_URL}/health`, { headers });

  check(healthRes, {
    "health check status 200": (r) => r.status === 200,
  });

  // ── Think time between iterations ──────────────────────────────────────────

  sleep(0.5 + Math.random() * 1.5); // 0.5-2s think time
}

// ── Setup and Teardown ───────────────────────────────────────────────────────

export function setup() {
  console.log(`k6 load test starting against ${BASE_URL}`);
  console.log(`Auth token: ${AUTH_TOKEN ? "configured" : "not set (dev mode)"}`);

  // Verify the server is reachable before starting
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Server not reachable at ${BASE_URL}/health (status: ${res.status})`);
  }
  console.log("Health check passed — starting load test");
}

export function teardown() {
  console.log("k6 load test completed");
}
