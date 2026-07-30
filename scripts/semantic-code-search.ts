import { createOllamaEmbeddingManager } from "../src/lib/dedup/embeddings";
import { closeDriver, getDriver } from "./lib/neo4j-stub";

async function semanticCodeSearch(query: string) {
  console.log(`[Search] Query: "${query}"`);

  const manager = createOllamaEmbeddingManager({
    baseUrl: "http://localhost:11434/v1",
    model: "qwen3-embedding:8b",
    dimensions: 4096,
  });

  const neo4jDriver = getDriver();
  const session = neo4jDriver.session();

  try {
    const queryEmbedding = await manager.getEmbedding(
      {
        id: "query",
        type: "insight",
        primaryText: query,
        properties: {},
        createdAt: new Date(),
      },
      { useCache: false }
    );

    const result = await session.run(
      `
      MATCH (c:CodeFile)
      WHERE c.embedding IS NOT NULL
      WITH c, 
        apoc.coll.sum([i in range(0, size(c.embedding)-1) | 
          c.embedding[i] * $queryEmbedding[i]]) AS dotProduct,
        sqrt(apoc.coll.sum([x in c.embedding | x^2])) AS normC,
        sqrt(apoc.coll.sum([x in $queryEmbedding | x^2])) AS normQ
      WITH c, dotProduct / (normC * normQ) AS similarity
      WHERE similarity > 0.3
      RETURN c.path AS file, 
             substring(c.content, 0, 300) AS preview,
             similarity
      ORDER BY similarity DESC
      LIMIT 5
      `,
      { queryEmbedding }
    );

    console.log(`\n[Results] Top ${result.records.length} matches:\n`);
    
    result.records.forEach((record: any, i: number) => {
      const file = record.get("file");
      const similarity = record.get("similarity");
      const preview = record.get("preview");
      
      console.log(`${i + 1}. ${file} (similarity: ${similarity.toFixed(4)})`);
      console.log(`   ${preview?.substring(0, 150).replace(/\n/g, ' ')}...\n`);
    });

    return result.records;
  } finally {
    await session.close();
    await closeDriver();
  }
}

const query = process.argv[2] || "circuit breaker";
semanticCodeSearch(query).catch(console.error);
