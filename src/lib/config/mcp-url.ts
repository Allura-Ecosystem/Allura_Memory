/**
 * Resolve the shared MCP gateway origin used by SDK requests and readiness probes.
 * Production topology must be configured explicitly; loopback is development-only.
 */
export function resolveMcpBaseUrl(override?: string): string {
  const configured = override ?? process.env.ALLURA_MCP_BASE_URL;
  const value = configured?.trim()
    || (process.env.NODE_ENV !== "production" ? "http://localhost:3201" : "");

  if (!value) {
    throw new Error("ALLURA_MCP_BASE_URL is required in production");
  }

  const hasOriginOnlySyntax = /^https?:\/\/[^/?#\\]+\/?$/i.test(value);
  if (!hasOriginOnlySyntax) {
    throw new Error("ALLURA_MCP_BASE_URL must be an HTTP(S) origin without credentials");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ALLURA_MCP_BASE_URL must be an HTTP(S) origin without credentials");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== "/"
  ) {
    throw new Error("ALLURA_MCP_BASE_URL must be an HTTP(S) origin without credentials");
  }

  return url.origin;
}
