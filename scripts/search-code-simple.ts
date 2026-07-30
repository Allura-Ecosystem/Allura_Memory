import { closeDriver, getDriver } from "./lib/neo4j-stub";

async function searchCode(query: string) {
  console.log(`[Search] Query: "${query}"`);

  const neo4jDriver = getDriver();
  const session = neo4jDriver.session();

  try {
    // Simple text search first
    const result = await session.run(
      `
      MATCH (c:CodeFile)
      WHERE toLower(c.content) CONTAINS toLower($query) 
         OR toLower(c.path) CONTAINS toLower($query)
      RETURN c.path AS file, 
             substring(c.content, 0, 300) AS preview
      LIMIT 10
      `,
      { query }
    );

    console.log(`\n[Results] Found ${result.records.length} matches:\n`);
    
    result.records.forEach((record: any, i: number) => {
      const file = record.get("file");
      const preview = record.get("preview");
      
      console.log(`${i + 1}. ${file}`);
      console.log(`   ${preview?.substring(0, 150).replace(/\n/g, ' ')}...\n`);
    });

    return result.records;
  } finally {
    await session.close();
    await closeDriver();
  }
}

const query = process.argv[2] || "embedding";
searchCode(query).catch(console.error);
