/**
 * RuVector Embedding Service
 *
 * Generates 1024-dim vectors via an OpenAI-compatible /v1/embeddings endpoint.
 *
 * Supports two backends:
 *   1. Ollama (local) — qwen3-embedding:8b/0.6b with MRL dimension reduction
 *   2. HuggingFace Inference Providers (serverless) — BAAI/bge-m3 or similar
 *      (native 1024-dim, no MRL needed, zero local RAM)
 *
 * Environment variables:
 * - RUVECTOR_EMBEDDING_MODEL: model name (default: qwen3-embedding:8b)
 * - RUVECTOR_EMBEDDING_BASE_URL: endpoint base URL (default: http://localhost:11434)
 * - RUVECTOR_EMBEDDING_API_KEY: bearer token for hosted providers (optional, local Ollama doesn't need this)
 * - RUVECTOR_EMBEDDING_SEND_DIMENSIONS: set to "false" to skip the dimensions parameter
 *   (needed for HuggingFace models that output native dims and don't support MRL truncation)
 *
 * Graceful degradation: if the embedding provider is unreachable or returns an error,
 * the calling code should still store the memory — just without an
 * embedding vector (NULL). Status becomes "stored_pending_embedding".
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("RuVector embedding service can only be used server-side");
}

// ── Configuration ────────────────────────────────────────────────────────────

/** Default model — qwen3-embedding:8b with MRL dimension reduction to 1024d */
const DEFAULT_MODEL = "qwen3-embedding:8b";

/** Default Ollama endpoint */
const DEFAULT_BASE_URL = "http://localhost:11434";

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30_000;
const WARMUP_REQUEST_TIMEOUT_MS = 5_000;

/** Max concurrent embedding requests in batch */
const BATCH_CONCURRENCY = 5;

/** Embedding dimensions — 1024d via Matryoshka (HNSW-compatible, < 2000d pgvector limit) */
const EMBEDDING_DIMENSIONS = 1024;

/**
 * Read model name from environment (falls back to default).
 */
function getModel(): string {
  return process.env.RUVECTOR_EMBEDDING_MODEL ?? DEFAULT_MODEL;
}

/**
 * Read Ollama base URL from environment (falls back to default).
 */
function getBaseUrl(): string {
  return process.env.RUVECTOR_EMBEDDING_BASE_URL ?? DEFAULT_BASE_URL;
}

// ── Ollama Response Types ────────────────────────────────────────────────────

/** OpenAI-compatible /v1/embeddings response shape */
interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for a single text string.
 *
 * Calls Ollama's /api/embeddings endpoint with the configured model.
 * Returns null on failure (Ollama down, timeout, invalid response) —
 * graceful degradation so memory storage never blocks on embeddings.
 *
 * @param text - The text to embed
 * @returns Embedding vector (number[]) or null if generation failed
 */
export async function generateEmbedding(text: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<number[] | null> {
  const baseUrl = getBaseUrl();
  const model = getModel();
  const url = `${baseUrl}/v1/embeddings`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Build headers — add Authorization bearer if API key is configured
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = process.env.RUVECTOR_EMBEDDING_API_KEY;
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Build request body — include dimensions param only for MRL-capable models (Ollama qwen3)
    // HuggingFace models output native dims and may reject the dimensions parameter
    const sendDimensions = process.env.RUVECTOR_EMBEDDING_SEND_DIMENSIONS !== "false";
    const body: Record<string, unknown> = { model, input: text };
    if (sendDimensions) {
      body.dimensions = EMBEDDING_DIMENSIONS;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.warn(
        `[RuVector Embedding] Provider returned ${response.status}: ${errorBody.slice(0, 200)}`
      );
      return null;
    }

    const data: OpenAIEmbeddingResponse = await response.json();

    const embedding = data.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      console.warn(
        `[RuVector Embedding] Invalid response: missing or empty embedding array`
      );
      return null;
    }

    return embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[RuVector Embedding] Failed to generate embedding: ${message}`);
    return null;
  }
}

/**
 * Warm the embedding model during startup.
 * Uses a shorter timeout so boot can continue even if Ollama is slow.
 */
export async function warmupEmbedding(): Promise<boolean> {
  const embedding = await generateEmbedding("Allura embedding warmup", WARMUP_REQUEST_TIMEOUT_MS);
  return embedding !== null;
}

/**
 * Generate embeddings for multiple texts in parallel (max concurrency 5).
 *
 * Calls generateEmbedding for each text, with a concurrency limit
 * to avoid overwhelming Ollama. Returns results in the same order
 * as the input array. Individual failures produce null entries.
 *
 * @param texts - Array of text strings to embed
 * @returns Array of embedding vectors (or null for failures)
 */
export async function generateEmbeddingBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  // Process in chunks with bounded concurrency
  for (let i = 0; i < texts.length; i += BATCH_CONCURRENCY) {
    const chunk = texts.slice(i, i + BATCH_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((text) => generateEmbedding(text)));

    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j];
    }
  }

  return results;
}

/**
 * Returns the expected embedding dimension count.
 *
 * This matches the Matryoshka-reduced output (1024 dimensions).
 * Used by callers that need to know the vector size for DB column
 * types or validation.
 *
 * @returns 1024
 */
export function getEmbeddingDimensions(): number {
  return EMBEDDING_DIMENSIONS;
}
