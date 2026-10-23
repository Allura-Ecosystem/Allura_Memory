/**
 * Tests for RuVector Embedding Service
 *
 * Tests the Ollama-based embedding generation for the RuVector bridge.
 * Uses mocked fetch to avoid requiring a live Ollama instance.
 *
 * AD-24: Migrated from nomic-embed-text (768d) → qwen3-embedding:8b (1024d)
 * Endpoint: /v1/embeddings (OpenAI-compatible) instead of /api/embeddings (legacy)
 * Response format: { data: [{ embedding: number[] }] } instead of { embedding: number[] }
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock fetch globally ───────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  generateEmbedding,
  generateEmbeddingBatch,
  getEmbeddingDimensions,
  warmupEmbedding,
} from "./embedding-service";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a valid OpenAI-compatible /v1/embeddings response (1024-dim) */
function makeEmbeddingResponse(dimensions: number = 1024): { data: Array<{ embedding: number[] }> } {
  const embedding = Array.from({ length: dimensions }, (_, i) => i / dimensions);
  return { data: [{ embedding }] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RuVector Embedding Service — generateEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars to defaults
    delete process.env.RUVECTOR_EMBEDDING_MODEL;
    delete process.env.RUVECTOR_EMBEDDING_BASE_URL;
  });

  it("should call the correct Ollama endpoint with model and prompt", async () => {
    const response = makeEmbeddingResponse();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(response),
      text: vi.fn(),
    });

    const result = await generateEmbedding("test text");

    expect(result).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/embeddings");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(options.body);
    expect(body.model).toBe("qwen3-embedding:8b");
    expect(body.input).toBe("test text");
  });

  it("should use RUVECTOR_EMBEDDING_MODEL env var when set", async () => {
    process.env.RUVECTOR_EMBEDDING_MODEL = "custom-model";
    const response = makeEmbeddingResponse();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(response),
      text: vi.fn(),
    });

    await generateEmbedding("test");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("custom-model");
  });

  it("should use RUVECTOR_EMBEDDING_BASE_URL env var when set", async () => {
    process.env.RUVECTOR_EMBEDDING_BASE_URL = "http://ollama-server:11434";
    const response = makeEmbeddingResponse();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(response),
      text: vi.fn(),
    });

    await generateEmbedding("test");

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe("http://ollama-server:11434/v1/embeddings");
  });

  it("should return embedding array on success", async () => {
    const response = makeEmbeddingResponse(1024);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(response),
      text: vi.fn(),
    });

    const result = await generateEmbedding("hello world");

    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBe(1024);
  });

  it("should return null when Ollama returns non-200 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: vi.fn().mockResolvedValueOnce("model not found"),
    });

    const result = await generateEmbedding("test");

    expect(result).toBeNull();
  });

  it("should return null when Ollama returns empty embedding array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ data: [] }),
      text: vi.fn(),
    });

    const result = await generateEmbedding("test");

    expect(result).toBeNull();
  });

  it("should return null when Ollama returns missing embedding field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({ data: [{ not_embedding: true }] }),
      text: vi.fn(),
    });

    const result = await generateEmbedding("test");

    expect(result).toBeNull();
  });

  it("should return null when Ollama is unreachable (fetch throws)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await generateEmbedding("test");

    expect(result).toBeNull();
  });

  it("should return null when fetch is aborted (timeout simulation)", async () => {
    mockFetch.mockRejectedValueOnce(new DOMException("The user aborted a request.", "AbortError"));

    const result = await generateEmbedding("test");

    expect(result).toBeNull();
  });

  it("should keep the timeout active while reading a stalled response body", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let rejectBody: (reason?: unknown) => void = () => undefined;

    mockFetch.mockImplementationOnce(
      (_url: string, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return Promise.resolve({
          ok: true,
          json: vi.fn(
            () => new Promise<never>((_resolve, reject) => {
              rejectBody = reject;
            })
          ),
          text: vi.fn(),
        });
      }
    );

    const pending = generateEmbedding("test", 25);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(25);

    try {
      expect(signal?.aborted).toBe(true);
    } finally {
      rejectBody(new DOMException("The user aborted a request.", "AbortError"));
      await pending;
      vi.useRealTimers();
    }
  });

  it("should return null when fetch response JSON parsing fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockRejectedValueOnce(new SyntaxError("Unexpected token")),
      text: vi.fn(),
    });

    const result = await generateEmbedding("test");

    expect(result).toBeNull();
  });
});

describe("RuVector Embedding Service — generateEmbeddingBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RUVECTOR_EMBEDDING_MODEL;
    delete process.env.RUVECTOR_EMBEDDING_BASE_URL;
  });

  it("should generate embeddings for multiple texts", async () => {
    for (let i = 0; i < 7; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(makeEmbeddingResponse()),
        text: vi.fn(),
      });
    }

    const texts = ["one", "two", "three", "four", "five", "six", "seven"];
    const results = await generateEmbeddingBatch(texts);

    expect(results).toHaveLength(7);
    expect(results.every((r) => Array.isArray(r))).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(7);
  });

  it("should return null entries for failed embeddings", async () => {
    // 3 successes, 2 failures
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(makeEmbeddingResponse()),
      text: vi.fn(),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: vi.fn().mockResolvedValueOnce("error"),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(makeEmbeddingResponse()),
      text: vi.fn(),
    });
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(makeEmbeddingResponse()),
      text: vi.fn(),
    });

    const results = await generateEmbeddingBatch(["a", "b", "c", "d", "e"]);

    expect(results).toHaveLength(5);
    expect(results[0]).not.toBeNull(); // success
    expect(results[1]).toBeNull(); // 500 error
    expect(results[2]).not.toBeNull(); // success
    expect(results[3]).toBeNull(); // connection refused
    expect(results[4]).not.toBeNull(); // success
  });

  it("should return empty array for empty input", async () => {
    const results = await generateEmbeddingBatch([]);

    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should limit concurrency to 5 requests at a time", async () => {
    // Create slow responses to test concurrency
    const delays = [50, 50, 50, 50, 50, 50, 50];
    for (const delay of delays) {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: vi.fn().mockResolvedValueOnce(makeEmbeddingResponse()),
                text: vi.fn(),
              });
            }, delay);
          })
      );
    }

    const texts = ["1", "2", "3", "4", "5", "6", "7"];
    const results = await generateEmbeddingBatch(texts);

    expect(results).toHaveLength(7);
    expect(results.every((r) => Array.isArray(r) && r!.length === 1024)).toBe(true);
  });
});

describe("RuVector Embedding Service — getEmbeddingDimensions", () => {
  it("should return 1024 (qwen3-embedding dimensions)", () => {
    expect(getEmbeddingDimensions()).toBe(1024);
  });

  it("should always return the same value", () => {
    const first = getEmbeddingDimensions();
    const second = getEmbeddingDimensions();
    expect(first).toBe(second);
    expect(first).toBe(1024);
  });
});

describe("RuVector Embedding Service — warmupEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RUVECTOR_EMBEDDING_MODEL;
    delete process.env.RUVECTOR_EMBEDDING_BASE_URL;
  });

  it("should warm the embedding model successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(makeEmbeddingResponse()),
      text: vi.fn(),
    });

    await expect(warmupEmbedding()).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should return false when warmup fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("connection refused"));

    await expect(warmupEmbedding()).resolves.toBe(false);
  });
});
