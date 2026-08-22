#!/usr/bin/env node
/**
 * Re-embed allura_memories rows from 4096d to 1024d using Ollama /v1/embeddings
 * 
 * Usage: node scripts/re-embed-to-1024d.mjs
 * 
 * Requires: Ollama running on localhost:11434 with qwen3-embedding:8b
 */

const OLLAMA_BASE = process.env.EMBEDDING_BASE_URL || 'http://localhost:11434';
const BATCH_SIZE = 5;
const DELAY_MS = 100;

// Direct PG connection.
// Never hardcode a credential fallback here: this file is tracked, and a committed
// password is compromised the moment it reaches a remote. Compose from the
// environment and fail fast when it is absent.
const PG_CONN =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  (process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_HOST
    ? `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'memory'}`
    : null);

if (!PG_CONN) {
  console.error(
    'No database connection configured. Set DATABASE_URL, or POSTGRES_USER + POSTGRES_PASSWORD + POSTGRES_HOST.'
  );
  process.exit(1);
}

import pg from 'pg';
const { Pool } = pg.default || pg;

async function main() {
  const pool = new Pool({ connectionString: PG_CONN });
  
  // Get all rows needing re-embedding
  const { rows } = await pool.query(
    'SELECT id, content FROM allura_memories WHERE embedding IS NOT NULL AND embedding_1024 IS NULL ORDER BY id'
  );
  
  console.log(`Found ${rows.length} rows to re-embed`);
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const resp = await fetch(`${OLLAMA_BASE}/v1/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen3-embedding:8b',
            input: row.content,
            dimensions: 1024
          })
        });
        
        if (!resp.ok) throw new Error(`Ollama returned ${resp.status}`);
        const data = await resp.json();
        
        if (!data.data?.[0]?.embedding?.length) {
          throw new Error('Invalid embedding response');
        }
        
        // Verify dimensions
        if (data.data[0].embedding.length !== 1024) {
          throw new Error(`Expected 1024d, got ${data.data[0].embedding.length}d`);
        }
        
        // Update PG
        const embeddingStr = `[${data.data[0].embedding.join(',')}]`;
        await pool.query(
          'UPDATE allura_memories SET embedding_1024 = $1::vector WHERE id = $2',
          [embeddingStr, row.id]
        );
        
        return row.id;
      })
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        success++;
      } else {
        failed++;
        console.error(`Failed: ${result.reason?.message || result.reason}`);
      }
    }
    
    console.log(`Progress: ${i + batch.length}/${rows.length} (✓${success} ✗${failed})`);
    
    // Rate limit
    if (i + BATCH_SIZE < rows.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  
  console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
  
  // Verify
  const { rows: verify } = await pool.query(
    'SELECT count(*) as cnt FROM allura_memories WHERE embedding_1024 IS NOT NULL'
  );
  console.log(`Total rows with 1024d embeddings: ${verify[0].cnt}`);
  
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});