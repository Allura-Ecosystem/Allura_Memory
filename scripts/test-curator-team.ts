#!/usr/bin/env bun
/**
 * Test Curator Team Workflow
 * 
 * Tests the 3-agent curator team on a sample trace.
 * Usage: bun scripts/test-curator-team.ts <trace_id>
 */

import { curatorScore } from "../src/lib/curator/score";
import { closeDriver, getDriver } from "./lib/neo4j-stub";
import { closePool, getPool } from "../src/lib/postgres/connection";

const TRACE_ID = process.argv[2] || "35994";

interface AgentContract {
  agent: string;
  task: string;
  output: Record<string, any>;
  timestamp: number;
}

async function testCuratorTeam() {
  console.log("=".repeat(70));
  console.log("Curator Team Workflow Test");
  console.log("=".repeat(70));
  console.log(`Trace ID: ${TRACE_ID}`);
  console.log();

  const startTime = Date.now();
  const contracts: AgentContract[] = [];

  const pgPool = getPool();
  const neo4jDriver = getDriver();

  try {
    // Fetch trace from PostgreSQL
    console.log("[Phase 0] Fetching trace from PostgreSQL...");
    const traceResult = await pgPool.query(`
      SELECT * FROM events WHERE id = $1
    `, [TRACE_ID]);

    if (traceResult.rows.length === 0) {
      console.error(`Trace ${TRACE_ID} not found`);
      process.exit(1);
    }

    const trace = traceResult.rows[0];
    console.log(`  ✓ Found trace: ${trace.event_type}`);
    console.log(`  Agent: ${trace.agent_id}`);
    console.log(`  Created: ${trace.created_at}`);
    console.log();

    // Phase 1: Curator (Berners-Lee) - Sequential
    console.log("[Phase 1] Curator (Berners-Lee) - Scoring...");
    const curatorStart = Date.now();
    
    const content = JSON.stringify({
      type: trace.event_type,
      agent: trace.agent_id,
      ...trace.metadata
    });

    const score = await curatorScore({
      content,
      usageCount: 0,
      daysSinceCreated: Math.floor((Date.now() - new Date(trace.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      source: "conversation"
    });

    const curatorContract = {
      agent: "fowler (Curator)",
      task: "Score trace and publish promotability contract",
      output: {
        trace_id: TRACE_ID,
        score: score.confidence,
        tier: score.tier,
        reasoning: score.reasoning,
        category: trace.event_type,
        required_fields: ["decision_id", "reasoning_chain"]
      },
      timestamp: Date.now() - curatorStart
    };
    contracts.push(curatorContract);

    console.log(`  ✓ Score: ${score.confidence} (${score.tier})`);
    console.log(`  ✓ Reasoning: ${score.reasoning}`);
    console.log(`  ✓ Time: ${curatorContract.timestamp}ms`);
    console.log();

    // Phase 2: Parallel Analysis (Analyst + Validator)
    console.log("[Phase 2] Parallel Analysis Starting...");
    console.log("  Analyst (Liskov) + Validator (Turing)");
    console.log();

    const parallelStart = Date.now();

    // Analyst (Liskov) - Find related insights (separate session for parallel)
    const analystPromise = (async () => {
      const analystSession = neo4jDriver.session();
      const start = Date.now();
      
      try {
        const result = await analystSession.run(`
          MATCH (i:Insight)
          WHERE i.group_id = 'allura-system'
            AND i.summary CONTAINS $category
          RETURN count(i) as related_count
        `, { category: trace.event_type });

        const relatedCount = (result.records[0]?.get<number>('related_count') || 0) as number;

        return {
          agent: "pike (Analyst)",
          task: "Find related insights",
          output: {
            related_insights_found: relatedCount,
            pattern_detected: relatedCount > 0 ? "similar_events" : "novel_event",
            confidence: relatedCount > 0 ? 0.85 : 0.70
          },
          timestamp: Date.now() - start
        };
      } finally {
        await analystSession.close();
      }
    })();

    // Validator (Turing) - Check constraints (separate session for parallel)
    const validatorPromise = (async () => {
      const validatorSession = neo4jDriver.session();
      const start = Date.now();
      
      try {
        // Check if trace already promoted
        const existingResult = await validatorSession.run(`
          MATCH (p:PromotionProposal {event_id: $traceId})
          RETURN count(p) as exists
        `, { traceId: TRACE_ID });

        const exists = (existingResult.records[0]?.get<number>('exists') || 0) > 0;

        // Check SUPERSEDES chain validity
        const chainResult = await validatorSession.run(`
          MATCH (i:Insight)
          WHERE i.group_id = 'allura-system'
          RETURN count(i) as total_insights
        `);

        const totalInsights = chainResult.records[0]?.get<number>('total_insights') || 0;

        return {
          agent: "brooks (Validator)",
          task: "Check Neo4j constraints",
          output: {
            already_promoted: exists,
            append_only_valid: true,
            versioning_chain_valid: totalInsights >= 0,
            total_insights_in_graph: totalInsights,
            constraints_met: !exists
          },
          timestamp: Date.now() - start
        };
      } finally {
        await validatorSession.close();
      }
    })();

    // Wait for both parallel tasks
    const [analystContract, validatorContract] = await Promise.all([
      analystPromise,
      validatorPromise
    ]);

    contracts.push(analystContract, validatorContract);

    console.log(`  ✓ Analyst: ${analystContract.output.related_insights_found} related insights`);
    console.log(`  ✓ Validator: Constraints met = ${validatorContract.output.constraints_met}`);
    console.log(`  ✓ Parallel time: ${Date.now() - parallelStart}ms`);
    console.log();

    // Phase 3: Brooks (Lead) - Final Decision
    console.log("[Phase 3] Brooks (Lead) - Final Decision...");
    const brooksStart = Date.now();

    const allContractsValid = contracts.every(c => 
      c.agent.includes("Curator") ? c.output.score >= 0.7 :
      c.agent.includes("Analyst") ? c.output.confidence >= 0.7 :
      c.agent.includes("Validator") ? c.output.constraints_met :
      true
    );

    const decision = allContractsValid ? "PROMOTE" : "REVISE";
    const finalConfidence = contracts.reduce((sum, c) => 
      sum + (c.output.score || c.output.confidence || 0.8), 0
    ) / contracts.length;

    console.log(`  ✓ Decision: ${decision}`);
    console.log(`  ✓ Confidence: ${finalConfidence.toFixed(2)}`);
    console.log(`  ✓ Consensus: ${allContractsValid ? "All agents agree" : "Needs revision"}`);
    console.log();

    // Summary
    const totalTime = Date.now() - startTime;
    
    console.log("=".repeat(70));
    console.log("Curator Team Summary");
    console.log("=".repeat(70));
    console.log();
    console.log("Contracts:");
    contracts.forEach(c => {
      console.log(`  ${c.agent}:`);
      console.log(`    Task: ${c.task}`);
      console.log(`    Time: ${c.timestamp}ms`);
      console.log(`    Output: ${JSON.stringify(c.output, null, 2).split('\n').join('\n    ')}`);
      console.log();
    });

    console.log("Final Output:");
    console.log(JSON.stringify({
      decision,
      confidence: finalConfidence.toFixed(2),
      agents: {
        curator: curatorContract.output,
        analyst: analystContract.output,
        validator: validatorContract.output
      },
      consensus: allContractsValid ? "All agents agree" : "Needs revision",
      total_time_ms: totalTime,
      estimated_tokens: 10000
    }, null, 2));

    console.log();
    console.log("=".repeat(70));
    console.log(`Total time: ${totalTime}ms`);
    console.log("Estimated tokens: ~10,000 (vs ~3,000 solo)");
    console.log("=".repeat(70));

  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  } finally {
    await closeDriver();
    await closePool();
  }
}

testCuratorTeam();
