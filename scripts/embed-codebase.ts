import { readdir , readFile } from "fs/promises";
import { join } from "path";
import { createOllamaEmbeddingManager } from "../src/lib/dedup/embeddings";
import { closeDriver, getDriver } from "./lib/neo4j-stub";

async function getTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...await getTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      files.push(fullPath);
    }
  }
  
  return files;
}


async function embedCodebase() {
  console.log("[Embedder] Starting codebase embedding with qwen3-embedding:8b...");

  const manager = createOllamaEmbeddingManager({
    baseUrl: "http://localhost:11434/v1",
    model: "qwen3-embedding:8b",
    dimensions: 4096,
  });

  const neo4jDriver = getDriver();
  const session = neo4jDriver.session();

  try {
    const files = await getTsFiles("src");
    console.log(`[Embedder] Found ${files.length} TypeScript files`);

    for (const file of files.slice(0, 50)) {
      try {
        const content = await readFile(file, "utf-8");
        const embedding = await manager.getEmbedding(
          {
            id: `file:${file}`,
            type: "insight",
            primaryText: `File: ${file}\n${content.substring(0, 5000)}`,
            properties: { path: file },
            createdAt: new Date(),
          },
          { useCache: true }
        );

        await session.run(`
          MERGE (c:CodeFile {path: $path})
          SET c.content = $content,
              c.embedding = $embedding,
              c.embedded_at = datetime(),
              c.model = "qwen3-embedding:8b"
        `, {
          path: file,
          content: content.substring(0, 5000),
          embedding: embedding,
        });

        console.log(`[Embedder] ✓ ${file}`);
      } catch (err: any) {
        console.error(`[Embedder] ✗ ${file}:`, err.message);
      }
    }

    console.log("[Embedder] Complete!");
  } finally {
    await session.close();
    await closeDriver();
  }
}

embedCodebase().catch(console.error);
