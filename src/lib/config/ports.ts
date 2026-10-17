/**
 * Port Configuration for Allura Memory
 * 
 * Uses randomized ports to avoid conflicts with other services.
 * Ports are assigned from specific ranges to prevent collisions.
 */

import { randomInt } from "crypto";

/**
 * Port ranges for different services
 * 
 * - Allura Dashboard (Next.js): 3100-3199
 * - Allura MCP HTTP Gateway: 3200-3299
 * - PostgreSQL: 5432 (standard, configurable)
 * - Dozzle (logs): 8088 (standard, configurable)
 */
export const PORT_RANGES = {
  dashboard: { min: 3100, max: 3199, default: 3100 },
  openclaw: { min: 3200, max: 3299, default: 3200 },
  mcp_http: { min: 3200, max: 3299, default: 3201 },
  postgres: { min: 5400, max: 5499, default: 5432 },
  dozzle: { min: 8080, max: 8089, default: 8088 },
} as const;

/**
 * Generate a random port within a range
 */
function getRandomPort(min: number, max: number): number {
  return randomInt(min, max + 1);
}

/**
 * Get port from environment or generate random
 */
export function getPort(
  serviceName: keyof typeof PORT_RANGES,
  envVar?: string
): number {
  // Check environment variable first
  if (envVar) {
    const envPort = process.env[envVar];
    if (envPort) {
      const port = parseInt(envPort, 10);
      if (!isNaN(port) && port >= 1 && port <= 65535) {
        return port;
      }
    }
  }

  // Check NEXT_PUBLIC_APP_URL for Allura Dashboard
  if (serviceName === "dashboard") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      const urlPort = new URL(appUrl).port;
      if (urlPort) {
        return parseInt(urlPort, 10);
      }
    }
  }

  // Use PORT environment variable if set
  const port = process.env.PORT;
  if (port) {
    const portNum = parseInt(port, 10);
    if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
      return portNum;
    }
  }

  // Generate random port from range
  const range = PORT_RANGES[serviceName];
  return getRandomPort(range.min, range.max);
}

/**
 * Port configuration object
 */
export interface PortConfig {
  dashboard: number;
  openclaw: number;
  mcp_http: number;
  postgres: number;
  dozzle: number;
}

/**
 * Get all port configurations
 */
export function getPortConfig(randomize: boolean = false): PortConfig {
  return {
    dashboard: randomize 
      ? getRandomPort(PORT_RANGES.dashboard.min, PORT_RANGES.dashboard.max)
      : getPort("dashboard", "ALLURA_DASHBOARD_PORT"),
    openclaw: randomize
      ? getRandomPort(PORT_RANGES.openclaw.min, PORT_RANGES.openclaw.max)
      : getPort("openclaw", "OPENCLAW_PORT"),
    mcp_http: randomize
      ? getRandomPort(PORT_RANGES.mcp_http.min, PORT_RANGES.mcp_http.max)
      : getPort("mcp_http", "ALLURA_MCP_HTTP_PORT"),
    postgres: getPort("postgres", "POSTGRES_PORT"),
    dozzle: getPort("dozzle", "DOZZLE_PORT"),
  };
}

/**
 * Get URLs for services
 */
export function getServiceUrls(ports?: Partial<PortConfig>): {
  dashboard: string;
  openclaw: string;
  mcp_http: string;
  postgres: string;
  dozzle: string;
} {
  const config = ports ? { ...getPortConfig(), ...ports } : getPortConfig();
  
  return {
    dashboard: `http://localhost:${config.dashboard}`,
    openclaw: `http://localhost:${config.openclaw}`,
    mcp_http: `http://localhost:${config.mcp_http}`,
    postgres: `postgresql://${process.env.POSTGRES_USER || "allura"}:${process.env.POSTGRES_PASSWORD || "password"}@localhost:${config.postgres}/${process.env.POSTGRES_DB || "memory"}`,
    dozzle: `http://localhost:${config.dozzle}`,
  };
}

/**
 * Environment variable names for ports
 */
export const PORT_ENV_VARS = {
  dashboard: "ALLURA_DASHBOARD_PORT",
  openclaw: "OPENCLAW_PORT",
  mcp_http: "ALLURA_MCP_HTTP_PORT",
  postgres: "POSTGRES_PORT",
  dozzle: "DOZZLE_PORT",
} as const;

/**
 * Generate .env entries for ports
 */
export function generateEnvEntries(randomize: boolean = false): string {
  const config = getPortConfig(randomize);
  
  return `
# =============================================================================
# Service Ports (auto-generated)
# =============================================================================
ALLURA_DASHBOARD_PORT=${config.dashboard}
OPENCLAW_PORT=${config.openclaw}
ALLURA_MCP_HTTP_PORT=${config.mcp_http}
POSTGRES_PORT=${config.postgres}
DOZZLE_PORT=${config.dozzle}

# Derived URLs
NEXT_PUBLIC_APP_URL=http://localhost:${config.dashboard}
OPENCLAW_GATEWAY_URL=http://localhost:${config.openclaw}
ALLURA_MCP_HTTP_URL=http://localhost:${config.mcp_http}
`.trim();
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const server = require("net").createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Find an available port in a range
 */
export async function findAvailablePort(
  min: number,
  max: number,
  maxAttempts: number = 10
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = getRandomPort(min, max);
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found in range ${min}-${max} after ${maxAttempts} attempts`);
}
