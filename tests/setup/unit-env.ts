/**
 * Unit-lane environment bootstrap.
 *
 * Token-minting code paths (MCP tokens, device rotation receipts) fail closed
 * without a signing secret, and CI deliberately provides none to the unit lane.
 * Generate an ephemeral, per-process secret when the environment has none, so
 * the tests are deterministic within a run without committing any secret value
 * and without weakening the production length/presence check. A real value
 * supplied by the environment is never overridden.
 */
import { randomBytes } from "node:crypto"

if (!process.env.ALLURA_MCP_TOKEN_SECRET) {
  process.env.ALLURA_MCP_TOKEN_SECRET = randomBytes(32).toString("hex")
}
