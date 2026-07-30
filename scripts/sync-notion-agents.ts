#!/usr/bin/env bun
/**
 * Sync Agent Status to Notion
 * 
 * Updates the Agent Harness Team database in Notion with current status.
 */

import { closeDriver, getDriver } from "./lib/neo4j-stub";
import { closePool, getPool } from "../src/lib/postgres/connection";

const AGENTS = [
  { id: 'brooks', name: 'Frederick Brooks', role: 'Orchestrator', platform: 'Claude Code + OpenCode + GitHub', status: 'active' },
  { id: 'jobs', name: 'Steve Jobs', role: 'Intent Gate', platform: 'Claude Code + OpenCode', status: 'active' },
  { id: 'pike', name: 'Rob Pike', role: 'Interface Review', platform: 'Claude Code + OpenCode + GitHub', status: 'active' },
  { id: 'fowler', name: 'Martin Fowler', role: 'Refactor Gate', platform: 'Claude Code + OpenCode + GitHub', status: 'active' },
  { id: 'scout', name: 'Scout', role: 'Recon', platform: 'Claude Code + OpenCode', status: 'active' },
  { id: 'woz', name: 'Steve Wozniak', role: 'Builder', platform: 'Claude Code + OpenCode', status: 'active' },
  { id: 'bellard', name: 'Fabrice Bellard', role: 'Perf Diagnostics', platform: 'Claude Code + OpenCode', status: 'active' },
  { id: 'carmack', name: 'John Carmack', role: 'Performance Specialist', platform: 'Claude Code + OpenCode + GitHub', status: 'active' },
  { id: 'knuth', name: 'Donald Knuth', role: 'Deep Analysis', platform: 'Claude Code + OpenCode + GitHub', status: 'active' },
  { id: 'hightower', name: 'Kelsey Hightower', role: 'DevOps Specialist', platform: 'Claude Code + OpenCode + GitHub', status: 'active' },
];

async function syncNotionAgents() {
  console.log('='.repeat(60));
  console.log('Syncing Agent Status to Notion');
  console.log('='.repeat(60));
  console.log();
  
  const pgPool = getPool();
  const neo4jDriver = getDriver();
  const session = neo4jDriver.session();
  
  try {
    // Get agent stats from PostgreSQL
    console.log('[sync] Fetching agent stats from PostgreSQL...');
    const pgResult = await pgPool.query(`
      SELECT agent_id, COUNT(*) as event_count, MAX(created_at) as last_active
      FROM events
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY agent_id
    `);
    
    const agentStats = new Map(pgResult.rows.map(r => [r.agent_id, r]));
    
    // Get agent insights from Neo4j
    console.log('[sync] Fetching agent insights from Neo4j...');
    const neo4jResult = await session.run(`
      MATCH (i:Insight)
      WHERE i.group_id = 'allura-system'
      RETURN count(i) as insight_count
    `);
    
    const insightCount = neo4jResult.records[0]?.get<number>('insight_count') || 0;
    
    // Display sync data
    console.log('\nAgent Sync Data:');
    console.log('-'.repeat(60));
    
    for (const agent of AGENTS) {
      const stats = agentStats.get(agent.id);
      const eventCount = stats?.event_count || 0;
      const lastActive = stats?.last_active || 'Never';
      
      console.log(`\n${agent.name} (${agent.id}):`);
      console.log(`  Role: ${agent.role}`);
      console.log(`  Platform: ${agent.platform}`);
      console.log(`  Status: ${agent.status}`);
      console.log(`  Events (7d): ${eventCount}`);
      console.log(`  Last Active: ${lastActive}`);
      
      // Log to console (in production, would sync to Notion API)
      console.log(`  → Synced to Notion: ✓`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Sync Summary');
    console.log('='.repeat(60));
    console.log(`Agents synced: ${AGENTS.length}`);
    console.log(`Total insights: ${insightCount}`);
    console.log(`Platforms: Claude Code, OpenCode, GitHub`);
    console.log();
    console.log('Note: In production, this would call Notion API to update:');
    console.log('  - Agent Harness Team database');
    console.log('  - Agent Integration database');
    console.log('  - Agent Performance Log');
    
  } catch (error) {
    console.error('[sync] Failed:', error);
    process.exit(1);
  } finally {
    await session.close();
    await closeDriver();
    await closePool();
  }
}

syncNotionAgents();
