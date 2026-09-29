/**
 * Allura Memory System Configuration
 * 
 * All configuration comes from environment variables.
 * Copy .env.example to .env.local and fill in your values.
 * 
 * NO HARDCODED CREDENTIALS - everything from env.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface AlluraMemoryConfig {
  // PostgreSQL (Raw Traces)
  postgresHost: string;
  postgresPort: number;
  postgresDb: string;
  postgresUser: string;
  postgresPassword: string;
  postgresPoolMax: number;
  
  // Multi-tenant
  defaultGroupId: string;
  
  // Embedding Provider
  embeddingProvider: 'ollama' | 'openai' | 'voyage';
  embeddingModel: string;
  embeddingBaseUrl: string;
  
  // LLM Provider (for auto-capture)
  opencodeProvider: 'ollama' | 'openai' | 'anthropic';
  opencodeModel: string;
  opencodeBaseUrl: string;
  
  // Auto-capture
  autoCaptureEnabled: boolean;
  autoCaptureLanguage: string;
  
  // User profile
  userProfileAnalysisInterval: number;
  profileLearningEnabled: boolean;
  
  // Similarity
  similarityThreshold: number;
  
  // Web UI
  webServerEnabled: boolean;
  webServerPort: number;
  
  // Governance
  autoPromoteEnabled: boolean;
  curatorAgentEnabled: boolean;
  
  // Retention
  traceRetentionDays: number;
  insightRetentionDays: number;
}

/**
 * Get configuration from environment variables
 * NO defaults for credentials - must be set in .env.local
 */
export function getConfig(): AlluraMemoryConfig {
  // PostgreSQL - required
  const postgresHost = process.env.POSTGRES_HOST;
  const postgresPassword = process.env.POSTGRES_PASSWORD;
  
  if (!postgresHost || !postgresPassword) {
    throw new Error(
      'PostgreSQL configuration required. Set POSTGRES_HOST and POSTGRES_PASSWORD in .env.local'
    );
  }
  
  // Build connection URL if not provided
  const postgresUser = process.env.POSTGRES_USER || 'allura';
  const postgresDb = process.env.POSTGRES_DB || 'memory';
  const postgresPort = parseInt(process.env.POSTGRES_PORT || '5432', 10);
  
  return {
    // PostgreSQL
    postgresHost,
    postgresPort,
    postgresDb,
    postgresUser,
    postgresPassword,
    postgresPoolMax: parseInt(process.env.POSTGRES_POOL_MAX || '10', 10),
    
    // Multi-tenant
    defaultGroupId: process.env.DEFAULT_GROUP_ID || 'allura-system',
    
    // Embedding Provider
    embeddingProvider: (process.env.EMBEDDING_PROVIDER as 'ollama' | 'openai' | 'voyage') || 'ollama',
    embeddingModel: process.env.EMBEDDING_MODEL || 'qwen3-embedding:8b',
    // Compatibility alias: prefer RUVECTOR_EMBEDDING_BASE_URL, fallback to EMBEDDING_BASE_URL
    embeddingBaseUrl: process.env.RUVECTOR_EMBEDDING_BASE_URL || process.env.EMBEDDING_BASE_URL || 'http://localhost:11434',
    
    // LLM Provider
    opencodeProvider: (process.env.OPENCODE_PROVIDER as 'ollama' | 'openai' | 'anthropic') || 'ollama',
    opencodeModel: process.env.OPENCODE_MODEL || 'qwen3:8b',
    opencodeBaseUrl: process.env.OPENCODE_BASE_URL || 'http://localhost:11434',
    
    // Auto-capture
    autoCaptureEnabled: process.env.AUTO_CAPTURE_ENABLED === 'true',
    autoCaptureLanguage: process.env.AUTO_CAPTURE_LANGUAGE || 'auto',
    
    // User profile
    userProfileAnalysisInterval: parseInt(process.env.USER_PROFILE_ANALYSIS_INTERVAL || '10', 10),
    profileLearningEnabled: process.env.PROFILE_LEARNING_ENABLED !== 'false',
    
    // Similarity
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.75'),
    
    // Web UI
    webServerEnabled: process.env.WEB_SERVER_ENABLED !== 'false',
    webServerPort: parseInt(process.env.WEB_SERVER_PORT || '4748', 10),
    
    // Governance
    autoPromoteEnabled: process.env.AUTO_PROMOTE_ENABLED === 'true',
    curatorAgentEnabled: process.env.CURATOR_AGENT_ENABLED !== 'false',
    
    // Retention
    traceRetentionDays: parseInt(process.env.TRACE_RETENTION_DAYS || '365', 10),
    insightRetentionDays: parseInt(process.env.INSIGHT_RETENTION_DAYS || '0', 10)
  };
}

/**
 * Get API key from environment
 * Supports: direct key, env://VAR_NAME, file://path
 */
export function getApiKey(keySpec: string | undefined, envVar: string): string {
  if (!keySpec) {
    // Try environment variable
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`API key not found. Set ${envVar} in .env.local`);
    }
    return envValue;
  }
  
  // Direct key
  if (keySpec.startsWith('sk-') || !keySpec.includes('://')) {
    return keySpec;
  }
  
  // File reference: file://path
  if (keySpec.startsWith('file://')) {
    const path = keySpec.replace('file://', '').replace('~', homedir());
    return readFileSync(path, 'utf-8').trim();
  }
  
  // Environment reference: env://VAR_NAME
  if (keySpec.startsWith('env://')) {
    const envVarName = keySpec.replace('env://', '');
    const value = process.env[envVarName];
    if (!value) {
      throw new Error(`Environment variable ${envVarName} not set`);
    }
    return value;
  }
  
  return keySpec;
}

/**
 * Validate configuration on startup
 */
export function validateConfig(): void {
  const config = getConfig();
  
  console.log('✓ Allura Memory Configuration:');
  console.log(`  PostgreSQL: ${config.postgresHost}:${config.postgresPort}/${config.postgresDb}`);
  console.log(`  Group ID: ${config.defaultGroupId}`);
  console.log(`  Embedding: ${config.embeddingProvider}/${config.embeddingModel}`);
  console.log(`  LLM: ${config.opencodeProvider}/${config.opencodeModel}`);
  console.log(`  Auto-capture: ${config.autoCaptureEnabled ? 'enabled' : 'disabled'}`);
  console.log(`  Web UI: http://localhost:${config.webServerPort}`);
}

/**
 * Write default .env.local file
 */
export function writeDefaultEnvFile(): void {
  const envPath = join(process.cwd(), '.env.local');
  
  if (existsSync(envPath)) {
    console.log('.env.local already exists, skipping');
    return;
  }
  
  const template = `# Allura Memory System Configuration
# Generated from .env.example - fill in your values

# PostgreSQL (Raw Traces)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=memory
POSTGRES_USER=allura
POSTGRES_PASSWORD=your-password-here

# Multi-tenant
DEFAULT_GROUP_ID=allura-system

# Embedding Provider (ollama, openai, voyage)
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:8b
# Runtime embedding service URL used by RuVector embedding code.
# For Docker services, use http://host.docker.internal:11434 with extra_hosts host-gateway.
RUVECTOR_EMBEDDING_BASE_URL=http://localhost:11434

# For OpenAI embeddings:
# EMBEDDING_PROVIDER=openai
# EMBEDDING_MODEL=text-embedding-3-small
# OPENAI_API_KEY=sk-your-key-here

# LLM Provider (for auto-capture)
OPENCODE_PROVIDER=ollama
OPENCODE_MODEL=qwen3:8b
OPENCODE_BASE_URL=http://localhost:11434

# Auto-capture
AUTO_CAPTURE_ENABLED=true

# Retention (days)
TRACE_RETENTION_DAYS=365
`;
  
  writeFileSync(envPath, template);
  console.log(`✓ Created .env.local template. Please fill in your credentials.`);
}

// Run validation on import
if (typeof window === 'undefined') {
  // Server-side only
  try {
    validateConfig();
  } catch (error) {
    console.error('⚠ Configuration error:', (error as Error).message);
    console.error('  Please check your .env.local file');
  }
}
