#!/usr/bin/env node
/**
 * Performance Benchmarking Script
 * Load tests the Unified Knowledge System pipeline
 * 
 * Usage:
 *   node scripts/benchmark.js [options]
 * 
 * Options:
 *   --events=N      Number of events to insert (default: 1000)
 *   --batch=N      Batch size for inserts (default: 100)
 *   --concurrent=N Concurrent connections (default: 10)
 *   --output=FILE   Output results to file
 */

const { Pool } = require("pg");
const { performance } = require("perf_hooks");

// Configuration
const config = {
  postgres: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
    database: process.env.POSTGRES_DB || "memory",
    user: process.env.POSTGRES_USER || "ronin4life",
    password: process.env.POSTGRES_PASSWORD,
  },
  benchmark: {
    eventCount: 1000,
    batchSize: 100,
    concurrentConnections: 10,
    outputFile: null,
  },
};

// Parse CLI args
process.argv.slice(2).forEach((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  if (key === "events") config.benchmark.eventCount = parseInt(value);
  if (key === "batch") config.benchmark.batchSize = parseInt(value);
  if (key === "concurrent") config.benchmark.concurrentConnections = parseInt(value);
  if (key === "output") config.benchmark.outputFile = value;
});

// Results storage
const results = {
  postgres: { insertLatency: [], queryLatency: [], throughput: 0 },
  summary: {},
};

/**
 * Benchmark PostgreSQL event insertion
 */
async function benchmarkPostgres(pgPool, count, batchSize) {
  console.log(`\n📊 Benchmarking PostgreSQL (${count} events, batch size: ${batchSize})...`);

  const startTotal = performance.now();
  let inserted = 0;

  for (let i = 0; i < count; i += batchSize) {
    const batchStart = performance.now();
    const batch = [];

    for (let j = 0; j < batchSize && i + j < count; j++) {
      batch.push(
        pgPool.query(
          `INSERT INTO events (group_id, event_type, agent_id, workflow_id, metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            `bench_group_${Math.floor((i + j) / 100)}`,
            `bench_event_${i + j}`,
            "benchmark_agent",
            "benchmark_workflow",
            JSON.stringify({ index: i + j, test: true }),
            "completed",
          ]
        )
      );
    }

    await Promise.all(batch);
    const batchElapsed = performance.now() - batchStart;
    results.postgres.insertLatency.push(batchElapsed);
    inserted += batch.length;
  }

  const totalElapsed = performance.now() - startTotal;
  results.postgres.throughput = Math.round((inserted / totalElapsed) * 1000);

  console.log(`   ✅ Inserted ${inserted} events in ${totalElapsed.toFixed(2)}ms`);
  console.log(`   📈 Throughput: ${results.postgres.throughput} events/sec`);

  // Query benchmark
  console.log("   📊 Query benchmark...");
  const queryStart = performance.now();
  await pgPool.query("SELECT * FROM events WHERE event_type LIKE 'bench_%'");
  const queryElapsed = performance.now() - queryStart;
  results.postgres.queryLatency.push(queryElapsed);
  console.log(`   ✅ Query completed in ${queryElapsed.toFixed(2)}ms`);

  // Cleanup
  await pgPool.query("DELETE FROM events WHERE event_type LIKE 'bench_%'");
  console.log("   🧹 Cleaned up benchmark data");
}

/**
 * Print summary
 */
function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log("📊 BENCHMARK RESULTS SUMMARY");
  console.log("=".repeat(60));

  console.log("\n🐘 PostgreSQL:");
  console.log(`   Events inserted: ${config.benchmark.eventCount}`);
  console.log(`   Throughput: ${results.postgres.throughput} events/sec`);
  console.log(
    `   Avg batch latency: ${(
      results.postgres.insertLatency.reduce((a, b) => a + b, 0) /
      results.postgres.insertLatency.length
    ).toFixed(2)}ms`
  );
  console.log(`   Query latency: ${results.postgres.queryLatency[0]?.toFixed(2) || "N/A"}ms`);

  // Calculate summary metrics
  results.summary = {
    timestamp: new Date().toISOString(),
    config: config.benchmark,
    postgres: {
      throughput: results.postgres.throughput,
      avgLatency:
        results.postgres.insertLatency.reduce((a, b) => a + b, 0) /
        results.postgres.insertLatency.length,
      queryLatency: results.postgres.queryLatency[0] || 0,
    },
  };

  if (config.benchmark.outputFile) {
    const fs = require("fs");
    fs.writeFileSync(config.benchmark.outputFile, JSON.stringify(results.summary, null, 2));
    console.log(`\n📁 Results written to ${config.benchmark.outputFile}`);
  }

  console.log("\n" + "=".repeat(60));
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log("🚀 Unified Knowledge System - Performance Benchmark");
  console.log("======================================================");
  console.log(`Events: ${config.benchmark.eventCount}`);
  console.log(`Batch size: ${config.benchmark.batchSize}`);
  console.log(`Concurrent: ${config.benchmark.concurrentConnections}`);

  // Verify environment
  if (!config.postgres.password) {
    console.error("❌ POSTGRES_PASSWORD environment variable required");
    process.exit(1);
  }

  // Initialize connections
  console.log("\n📡 Connecting to PostgreSQL...");

  const pgPool = new Pool({
    ...config.postgres,
    max: config.benchmark.concurrentConnections,
  });

  try {
    // Verify connections
    await pgPool.query("SELECT 1");
    console.log("   ✅ PostgreSQL connected");

    // Run benchmarks
    await benchmarkPostgres(pgPool, config.benchmark.eventCount, config.benchmark.batchSize);

    // Print summary
    printSummary();
  } catch (error) {
    console.error("❌ Benchmark failed:", error.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main().catch(console.error);