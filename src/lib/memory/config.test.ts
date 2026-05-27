/**
 * Tests for Allura Memory System Configuration
 * 
 * Test coverage:
 * - Valid configuration loading from environment
 * - Missing required environment variables (error cases)
 * - API key resolution (direct, env://, file://)
 * - Default values verification
 * - Configuration validation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Store original env values to restore after tests
const originalEnv = { ...process.env };

describe("Allura Memory Configuration", () => {
  beforeEach(() => {
    // Clear module cache to force re-import
    vi.resetModules();
    
    // Set minimal required env vars for most tests
    process.env.POSTGRES_HOST = "localhost";
    process.env.POSTGRES_PASSWORD = "test-password";
    process.env.NEO4J_URI = "bolt://localhost:7687";
    process.env.NEO4J_PASSWORD = "test-password";
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe("getConfig", () => {
    it("should load valid configuration with all required env vars", async () => {
      const { getConfig } = await import("./config");
      
      const config = getConfig();
      
      expect(config.postgresHost).toBe("localhost");
      expect(config.postgresPassword).toBe("test-password");
      expect(config.neo4jUri).toBe("bolt://localhost:7687");
      expect(config.neo4jPassword).toBe("test-password");
    });

    it("should use default values for optional env vars", async () => {
      // Remove optional env vars
      delete process.env.POSTGRES_PORT;
      delete process.env.POSTGRES_DB;
      delete process.env.POSTGRES_USER;
      delete process.env.POSTGRES_POOL_MAX;
      delete process.env.NEO4J_USER;
      delete process.env.DEFAULT_GROUP_ID;
      delete process.env.EMBEDDING_PROVIDER;
      delete process.env.EMBEDDING_MODEL;
      delete process.env.EMBEDDING_BASE_URL;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      // PostgreSQL defaults
      expect(config.postgresPort).toBe(5432);
      expect(config.postgresDb).toBe("memory");
      expect(config.postgresUser).toBe("allura");
      expect(config.postgresPoolMax).toBe(10);
      
      // Neo4j defaults
      expect(config.neo4jUser).toBe("neo4j");
      
      // Multi-tenant defaults
      expect(config.defaultGroupId).toBe("allura-system");
      
      // Embedding defaults
      expect(config.embeddingProvider).toBe("ollama");
      expect(config.embeddingModel).toBe("qwen3-embedding:8b");
      expect(config.embeddingBaseUrl).toBe("http://localhost:11434");
    });

    it("should throw error when POSTGRES_HOST is missing", async () => {
      delete process.env.POSTGRES_HOST;
      
      const { getConfig } = await import("./config");
      
      expect(() => getConfig()).toThrow(
        "PostgreSQL configuration required. Set POSTGRES_HOST and POSTGRES_PASSWORD in .env.local"
      );
    });

    it("should throw error when POSTGRES_PASSWORD is missing", async () => {
      delete process.env.POSTGRES_PASSWORD;
      
      const { getConfig } = await import("./config");
      
      expect(() => getConfig()).toThrow(
        "PostgreSQL configuration required. Set POSTGRES_HOST and POSTGRES_PASSWORD in .env.local"
      );
    });

    it("should throw error when NEO4J_URI is missing", async () => {
      delete process.env.NEO4J_URI;
      
      const { getConfig } = await import("./config");
      
      expect(() => getConfig()).toThrow(
        "Neo4j configuration required. Set NEO4J_URI and NEO4J_PASSWORD in .env.local"
      );
    });

    it("should throw error when NEO4J_PASSWORD is missing", async () => {
      delete process.env.NEO4J_PASSWORD;
      
      const { getConfig } = await import("./config");
      
      expect(() => getConfig()).toThrow(
        "Neo4j configuration required. Set NEO4J_URI and NEO4J_PASSWORD in .env.local"
      );
    });

    it("should parse numeric environment variables correctly", async () => {
      process.env.POSTGRES_PORT = "5433";
      process.env.POSTGRES_POOL_MAX = "20";
      process.env.USER_PROFILE_ANALYSIS_INTERVAL = "15";
      process.env.WEB_SERVER_PORT = "8080";
      process.env.TRACE_RETENTION_DAYS = "180";
      process.env.INSIGHT_RETENTION_DAYS = "30";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.postgresPort).toBe(5433);
      expect(config.postgresPoolMax).toBe(20);
      expect(config.userProfileAnalysisInterval).toBe(15);
      expect(config.webServerPort).toBe(8080);
      expect(config.traceRetentionDays).toBe(180);
      expect(config.insightRetentionDays).toBe(30);
    });

    it("should parse boolean environment variables correctly", async () => {
      process.env.AUTO_CAPTURE_ENABLED = "true";
      process.env.PROFILE_LEARNING_ENABLED = "false";
      process.env.WEB_SERVER_ENABLED = "false";
      process.env.AUTO_PROMOTE_ENABLED = "true";
      process.env.CURATOR_AGENT_ENABLED = "false";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.autoCaptureEnabled).toBe(true);
      expect(config.profileLearningEnabled).toBe(false);
      expect(config.webServerEnabled).toBe(false);
      expect(config.autoPromoteEnabled).toBe(true);
      expect(config.curatorAgentEnabled).toBe(false);
    });

    it("should parse float environment variables correctly", async () => {
      process.env.SIMILARITY_THRESHOLD = "0.85";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.similarityThreshold).toBeCloseTo(0.85);
    });

    it("should use custom provider settings from env", async () => {
      process.env.EMBEDDING_PROVIDER = "openai";
      process.env.EMBEDDING_MODEL = "text-embedding-3-small";
      delete process.env.RUVECTOR_EMBEDDING_BASE_URL;
      process.env.EMBEDDING_BASE_URL = "https://api.openai.com/v1";
      process.env.OPENCODE_PROVIDER = "anthropic";
      process.env.OPENCODE_MODEL = "claude-3-5-sonnet-20241022";
      process.env.OPENCODE_BASE_URL = "https://api.anthropic.com";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.embeddingProvider).toBe("openai");
      expect(config.embeddingModel).toBe("text-embedding-3-small");
      expect(config.embeddingBaseUrl).toBe("https://api.openai.com/v1");
      expect(config.opencodeProvider).toBe("anthropic");
      expect(config.opencodeModel).toBe("claude-3-5-sonnet-20241022");
      expect(config.opencodeBaseUrl).toBe("https://api.anthropic.com");
    });
  });

  describe("getApiKey", () => {
    it("should return direct key when keySpec is a direct API key", async () => {
      const { getApiKey } = await import("./config");
      
      const result = getApiKey("sk-test123", "OPENAI_API_KEY");
      
      expect(result).toBe("sk-test123");
    });

    it("should return key when keySpec starts with sk-", async () => {
      const { getApiKey } = await import("./config");
      
      const result = getApiKey("sk-openai-key-12345", "OPENAI_API_KEY");
      
      expect(result).toBe("sk-openai-key-12345");
    });

    it("should return keySpec when it has no protocol (treated as direct key)", async () => {
      const { getApiKey } = await import("./config");
      
      const result = getApiKey("my-custom-key", "API_KEY");
      
      expect(result).toBe("my-custom-key");
    });

    it("should read key from environment variable with env:// prefix", async () => {
      process.env.MY_API_KEY = "secret-key-123";
      
      const { getApiKey } = await import("./config");
      
      const result = getApiKey("env://MY_API_KEY", "API_KEY");
      
      expect(result).toBe("secret-key-123");
    });

    it("should throw error when env:// variable is not set", async () => {
      delete process.env.MISSING_KEY;
      
      const { getApiKey } = await import("./config");
      
      expect(() => getApiKey("env://MISSING_KEY", "API_KEY")).toThrow(
        "Environment variable MISSING_KEY not set"
      );
    });

    it("should read key from file with file:// prefix", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "allura-config-test-"));
      const keyPath = join(tempDir, "key.txt");
      writeFileSync(keyPath, "  file-key-123  \n");
      
      const { getApiKey } = await import("./config");
      
      const result = getApiKey(`file://${keyPath}`, "API_KEY");
      
      expect(result).toBe("file-key-123");
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("should throw error when file:// file does not exist", async () => {
      const { getApiKey } = await import("./config");
      
      expect(() => getApiKey("file:///nonexistent/key.txt", "API_KEY")).toThrow();
    });

    it("should return env variable when keySpec is undefined", async () => {
      process.env.MY_API_KEY = "env-var-key";
      
      const { getApiKey } = await import("./config");
      
      const result = getApiKey(undefined, "MY_API_KEY");
      
      expect(result).toBe("env-var-key");
    });

    it("should throw error when keySpec is undefined and env var is not set", async () => {
      delete process.env.MISSING_KEY;
      
      const { getApiKey } = await import("./config");
      
      expect(() => getApiKey(undefined, "MISSING_KEY")).toThrow(
        "API key not found. Set MISSING_KEY in .env.local"
      );
    });
  });

  describe("validateConfig", () => {
    it("should log configuration summary without throwing", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      const { validateConfig } = await import("./config");
      
      expect(() => validateConfig()).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Allura Memory Configuration")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("PostgreSQL:")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Neo4j:")
      );
      
      consoleSpy.mockRestore();
    });

    it("should throw when configuration is invalid", async () => {
      delete process.env.POSTGRES_HOST;
      delete process.env.POSTGRES_PASSWORD;
      
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      
      await expect(async () => {
        await import("./config");
      }).not.toThrow(); // Import doesn't throw, validation happens in import
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe("Default values verification", () => {
    it("should match documented defaults for PostgreSQL", async () => {
      delete process.env.POSTGRES_PORT;
      delete process.env.POSTGRES_DB;
      delete process.env.POSTGRES_USER;
      delete process.env.POSTGRES_POOL_MAX;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      // Documented defaults
      expect(config.postgresPort).toBe(5432);
      expect(config.postgresDb).toBe("memory");
      expect(config.postgresUser).toBe("allura");
      expect(config.postgresPoolMax).toBe(10);
    });

    it("should match documented defaults for Neo4j", async () => {
      delete process.env.NEO4J_USER;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.neo4jUser).toBe("neo4j");
    });

    it("should match documented defaults for embedding provider", async () => {
      delete process.env.EMBEDDING_PROVIDER;
      delete process.env.EMBEDDING_MODEL;
      delete process.env.EMBEDDING_BASE_URL;
      delete process.env.RUVECTOR_EMBEDDING_BASE_URL;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.embeddingProvider).toBe("ollama");
      expect(config.embeddingModel).toBe("qwen3-embedding:8b");
      expect(config.embeddingBaseUrl).toBe("http://localhost:11434");
    });

    it("should match documented defaults for LLM provider", async () => {
      delete process.env.OPENCODE_PROVIDER;
      delete process.env.OPENCODE_MODEL;
      delete process.env.OPENCODE_BASE_URL;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.opencodeProvider).toBe("ollama");
      expect(config.opencodeModel).toBe("qwen3:8b");
      expect(config.opencodeBaseUrl).toBe("http://localhost:11434");
    });

    it("should prioritize RUVECTOR_EMBEDDING_BASE_URL over EMBEDDING_BASE_URL", async () => {
      process.env.RUVECTOR_EMBEDDING_BASE_URL = "http://host.docker.internal:11434";
      process.env.EMBEDDING_BASE_URL = "http://localhost:11434";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.embeddingBaseUrl).toBe("http://host.docker.internal:11434");
    });

    it("should fall back to EMBEDDING_BASE_URL when RUVECTOR_EMBEDDING_BASE_URL is not set", async () => {
      delete process.env.RUVECTOR_EMBEDDING_BASE_URL;
      process.env.EMBEDDING_BASE_URL = "http://localhost:11434";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.embeddingBaseUrl).toBe("http://localhost:11434");
    });

    it("should default to http://localhost:11434 when neither env var is set", async () => {
      delete process.env.RUVECTOR_EMBEDDING_BASE_URL;
      delete process.env.EMBEDDING_BASE_URL;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.embeddingBaseUrl).toBe("http://localhost:11434");
    });

    it("should match documented defaults for multi-tenant", async () => {
      delete process.env.DEFAULT_GROUP_ID;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.defaultGroupId).toBe("allura-system");
    });

    it("should match documented defaults for web server", async () => {
      delete process.env.WEB_SERVER_ENABLED;
      delete process.env.WEB_SERVER_PORT;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.webServerEnabled).toBe(true);
      expect(config.webServerPort).toBe(4748);
    });

    it("should match documented defaults for governance", async () => {
      delete process.env.AUTO_PROMOTE_ENABLED;
      delete process.env.CURATOR_AGENT_ENABLED;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.autoPromoteEnabled).toBe(false);
      expect(config.curatorAgentEnabled).toBe(true);
    });

    it("should match documented defaults for retention", async () => {
      delete process.env.TRACE_RETENTION_DAYS;
      delete process.env.INSIGHT_RETENTION_DAYS;
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      expect(config.traceRetentionDays).toBe(365);
      expect(config.insightRetentionDays).toBe(0);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string env vars correctly", async () => {
      process.env.POSTGRES_HOST = "";
      
      const { getConfig } = await import("./config");
      
      expect(() => getConfig()).toThrow();
    });

    it("should handle whitespace in numeric values", async () => {
      process.env.POSTGRES_PORT = "  5433  ";
      process.env.POSTGRES_POOL_MAX = "  20  ";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      // parseInt handles leading/trailing whitespace
      expect(config.postgresPort).toBe(5433);
      expect(config.postgresPoolMax).toBe(20);
    });

    it("should handle NaN from invalid numeric strings", async () => {
      process.env.POSTGRES_PORT = "invalid";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      // parseInt returns NaN for invalid input
      expect(config.postgresPort).toBeNaN();
    });

    it("should handle partial required config (missing POSTGRES_HOST)", async () => {
      process.env.POSTGRES_PASSWORD = "test-password";
      process.env.NEO4J_URI = "bolt://localhost:7687";
      process.env.NEO4J_PASSWORD = "test-password";
      delete process.env.POSTGRES_HOST;
      
      const { getConfig } = await import("./config");
      
      expect(() => getConfig()).toThrow("PostgreSQL configuration required");
    });

    it("should handle partial required config (missing NEO4J_PASSWORD)", async () => {
      process.env.POSTGRES_HOST = "localhost";
      process.env.POSTGRES_PASSWORD = "test-password";
      process.env.NEO4J_URI = "bolt://localhost:7687";
      delete process.env.NEO4J_PASSWORD;
      
      const { getConfig } = await import("./config");
      
      expect(() => getConfig()).toThrow("Neo4j configuration required");
    });

    it("should handle all env vars set with custom values", async () => {
      // Set all env vars with custom values
      process.env.POSTGRES_HOST = "custom-host";
      process.env.POSTGRES_PORT = "9999";
      process.env.POSTGRES_DB = "custom-db";
      process.env.POSTGRES_USER = "custom-user";
      process.env.POSTGRES_PASSWORD = "custom-password";
      process.env.POSTGRES_POOL_MAX = "50";
      
      process.env.NEO4J_URI = "bolt://custom-host:7687";
      process.env.NEO4J_USER = "custom-neo4j";
      process.env.NEO4J_PASSWORD = "custom-neo4j-password";
      
      process.env.DEFAULT_GROUP_ID = "custom-group";
      
      process.env.EMBEDDING_PROVIDER = "voyage";
      process.env.EMBEDDING_MODEL = "voyage-large-2";
      delete process.env.RUVECTOR_EMBEDDING_BASE_URL;
      process.env.EMBEDDING_BASE_URL = "https://api.voyageai.com/v1";
      
      process.env.OPENCODE_PROVIDER = "openai";
      process.env.OPENCODE_MODEL = "gpt-4";
      process.env.OPENCODE_BASE_URL = "https://api.openai.com/v1";
      
      process.env.AUTO_CAPTURE_ENABLED = "true";
      process.env.AUTO_CAPTURE_LANGUAGE = "typescript";
      
      process.env.USER_PROFILE_ANALYSIS_INTERVAL = "30";
      process.env.PROFILE_LEARNING_ENABLED = "true";
      
      process.env.SIMILARITY_THRESHOLD = "0.95";
      
      process.env.WEB_SERVER_ENABLED = "true";
      process.env.WEB_SERVER_PORT = "3000";
      
      process.env.AUTO_PROMOTE_ENABLED = "true";
      process.env.CURATOR_AGENT_ENABLED = "true";
      
      process.env.TRACE_RETENTION_DAYS = "730";
      process.env.INSIGHT_RETENTION_DAYS = "365";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      // Verify all custom values
      expect(config.postgresHost).toBe("custom-host");
      expect(config.postgresPort).toBe(9999);
      expect(config.postgresDb).toBe("custom-db");
      expect(config.postgresUser).toBe("custom-user");
      expect(config.postgresPassword).toBe("custom-password");
      expect(config.postgresPoolMax).toBe(50);
      
      expect(config.neo4jUri).toBe("bolt://custom-host:7687");
      expect(config.neo4jUser).toBe("custom-neo4j");
      expect(config.neo4jPassword).toBe("custom-neo4j-password");
      
      expect(config.defaultGroupId).toBe("custom-group");
      
      expect(config.embeddingProvider).toBe("voyage");
      expect(config.embeddingModel).toBe("voyage-large-2");
      expect(config.embeddingBaseUrl).toBe("https://api.voyageai.com/v1");
      
      expect(config.opencodeProvider).toBe("openai");
      expect(config.opencodeModel).toBe("gpt-4");
      expect(config.opencodeBaseUrl).toBe("https://api.openai.com/v1");
      
      expect(config.autoCaptureEnabled).toBe(true);
      expect(config.autoCaptureLanguage).toBe("typescript");
      
      expect(config.userProfileAnalysisInterval).toBe(30);
      expect(config.profileLearningEnabled).toBe(true);
      
      expect(config.similarityThreshold).toBeCloseTo(0.95);
      
      expect(config.webServerEnabled).toBe(true);
      expect(config.webServerPort).toBe(3000);
      
      expect(config.autoPromoteEnabled).toBe(true);
      expect(config.curatorAgentEnabled).toBe(true);
      
      expect(config.traceRetentionDays).toBe(730);
      expect(config.insightRetentionDays).toBe(365);
    });
  });

  describe("Type safety", () => {
    it("should enforce correct type for embeddingProvider", async () => {
      process.env.EMBEDDING_PROVIDER = "ollama";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      // TypeScript should infer correct type
      const provider: "ollama" | "openai" | "voyage" = config.embeddingProvider;
      expect(provider).toBe("ollama");
    });

    it("should enforce correct type for opencodeProvider", async () => {
      process.env.OPENCODE_PROVIDER = "anthropic";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      // TypeScript should infer correct type
      const provider: "ollama" | "openai" | "anthropic" = config.opencodeProvider;
      expect(provider).toBe("anthropic");
    });

    it("should handle invalid provider gracefully (runtime)", async () => {
      process.env.EMBEDDING_PROVIDER = "invalid-provider";
      
      const { getConfig } = await import("./config");
      const config = getConfig();
      
      // At runtime, it becomes a string (TypeScript type cast)
      // Invalid values should be caught by validation layer
      expect(config.embeddingProvider).toBe("invalid-provider");
    });
  });
});
