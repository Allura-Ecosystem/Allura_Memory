/** Shared gateway location for SDK requests and dependency readiness.
 * Production must configure container/service topology explicitly.
 */
export function resolveMcpBaseUrl(override?: string): string {
  const configured = override ?? process.env.ALLURA_MCP_BASE_URL;
  const value = configured?.trim() || (process.env.NODE_ENV !== "production" ? "http://localhost:3201" : "");
  if (!value) throw new Error("ALLURA_MCP_BASE_URL is required in production");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("ALLURA_MCP_BASE_URL must be an HTTP(S) origin without credentials");
  }
  return url.origin;
}
