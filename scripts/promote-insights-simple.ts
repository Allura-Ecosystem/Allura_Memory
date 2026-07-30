#!/usr/bin/env bun
import { execSync } from "child_process";
import { closeDriver, getDriver } from "./lib/neo4j-stub";
import { closePool, getPool } from "../src/lib/postgres/connection";

async function promoteInsights() {
  console.log("[Promoter] Starting insight promotion...");
  
  const neo4jDriver = getDriver();
  const session = neo4jDriver.session();
  
  try {
    const result = await session.run(`
      MATCH (i:Insight)
      WHERE i.status = 'Proposed'
        OR i.status IS NULL
      RETURN i.insight_id AS id,
             i.summary AS summary,
             i.confidence AS confidence,
             i.trace_ref AS traceRef,
             i.source_type AS sourceType
      LIMIT 10
    `);
    
    const insights = result.records.map(r => ({
      id: r.get<string>('id'),
      summary: r.get<string>('summary'),
      confidence: r.get<number>('confidence'),
      traceRef: r.get<number>('traceRef'),
      sourceType: r.get<string>('sourceType')
    }));
    
    console.log(`[Promoter] Found ${insights.length} candidate insights`);
    
    for (const insight of insights) {
      try {
        const payload = {
          parent: { data_source_id: "9fac87b0-6429-4144-80a4-c34d05bb5d02" },
          pages: [{
            properties: {
              Name: insight.summary?.substring(0, 100) || "Untitled Insight",
              Confidence: insight.confidence || 0.5
            },
            content: `# Insight: ${insight.id}

**Summary:** ${insight.summary}

**Confidence:** ${insight.confidence}

**Source:** ${insight.traceRef}

**Type:** ${insight.sourceType}

*Promoted from Neo4j at ${new Date().toISOString()}*`
          }]
        };
        
        const response = execSync(
          `smithery tool call notion-memory notion-create-pages '${JSON.stringify(payload)}'`,
          { encoding: 'utf-8', timeout: 30000 }
        );
        
        console.log(`[Promoter] Created Notion page for insight ${insight.id}`);

        await session.run(`
          MATCH (i:Insight {insight_id: $id})
          SET i.status = 'promoted',
              i.promoted_at = datetime(),
              i.notion_url = $notionUrl
        `, { 
          id: insight.id,
          notionUrl: 'https://notion.so/...'
        });
        
      } catch (err) {
        console.error(`[Promoter] Failed to promote insight ${insight.id}:`, err instanceof Error ? err.message : String(err));
      }
    }
    
    console.log("[Promoter] Promotion complete!");
    
  } finally {
    await session.close();
    await closeDriver();
    await closePool();
  }
}

promoteInsights().catch(err => {
  console.error("[Promoter] Fatal error:", err);
  process.exit(1);
});
