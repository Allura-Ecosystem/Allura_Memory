#!/usr/bin/env bun

import { config } from "dotenv"

import { ensurePortfolioEnvironment } from "./portfolio-demo-env"

const action = process.argv[2]
if (action !== "up" && action !== "dev") {
  console.error("Usage: bun scripts/portfolio-demo.ts <up|dev>")
  process.exit(1)
}

const status = ensurePortfolioEnvironment()
if (status === "created") {
  console.log("Created .env.portfolio from the non-secret demo example.")
}

// Loading these values into the parent environment gives them precedence over
// `.env.local` when Next starts, while never printing their contents.
const loaded = config({ path: ".env.portfolio", override: true })
if (loaded.error) throw loaded.error

const command = action === "up"
  ? ["docker", "compose", "--env-file", ".env.portfolio", "-f", "docker-compose.portfolio.yml", "up", "-d", "--build", "--force-recreate"]
  : ["bun", "run", "dev"]
const child = Bun.spawn({ cmd: command, env: process.env, stdout: "inherit", stderr: "inherit" })
process.exit(await child.exited)
