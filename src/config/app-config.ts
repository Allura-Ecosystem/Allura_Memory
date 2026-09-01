import packageJson from "../../package.json"

const currentYear = new Date().getFullYear()

export const APP_CONFIG = {
  name: "Allura Memory",
  version: packageJson.version,
  copyright: `© ${currentYear}, Allura Memory.`,
  /** Default group_id for the dashboard — used across all pages */
  defaultGroupId: "allura-system",
  meta: {
    title: "Allura Memory — Governed AI Memory Engine",
    description:
      "Allura Memory is a self-hosted, compliance-grade AI memory engine with PostgreSQL traces, a versioned RuVector knowledge graph, and a human-in-the-loop curator pipeline. Exposed via MCP for any AI agent.",
  },
}
