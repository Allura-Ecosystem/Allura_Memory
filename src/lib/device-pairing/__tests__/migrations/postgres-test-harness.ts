import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { Pool, type PoolConfig } from "pg"
import { describe } from "vitest"

const migrationsDirectory = path.resolve(process.cwd(), "docker/postgres-init")

export const describeMigrationLive =
  process.env.RUN_E2E_TESTS === "true" &&
  process.env.POSTGRES_PASSWORD
    ? describe
    : describe.skip

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function ownerConfig(database: string): PoolConfig {
  return {
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database,
    user: process.env.POSTGRES_USER ?? "allura",
    password: process.env.POSTGRES_PASSWORD ?? "",
    max: 1,
  }
}

function appConfig(database: string): PoolConfig {
  return {
    ...ownerConfig(database),
    // Authenticate as the disposable database owner, then enter the exact
    // restricted role for every session. This proves grants and RLS without
    // reading or changing the cluster-global allura_app password.
    options: "-c role=allura_app",
  }
}

export interface MigrationDatabase {
  databaseName: string
  owner: Pool
  app: Pool
  close: () => Promise<void>
}

export async function createMigrationDatabase(
  label: string,
  throughFilename: string,
): Promise<MigrationDatabase> {
  const databaseName = `allura_291_${label}_${randomUUID().replaceAll("-", "")}`
  const root = new Pool(ownerConfig("postgres"))
  let owner: Pool | undefined
  let app: Pool | undefined

  try {
    await root.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
    owner = new Pool(ownerConfig(databaseName))

    const filenames = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) => name.localeCompare(throughFilename) <= 0)

    if (!filenames.includes(throughFilename)) {
      throw new Error(`Required migration ${throughFilename} was not found`)
    }

    for (const filename of filenames) {
      const sql = readFileSync(path.join(migrationsDirectory, filename), "utf8")
      try {
        await owner.query(sql)
      } catch (error) {
        throw new Error(`Failed to apply ${filename}: ${(error as Error).message}`)
      }
    }

    app = new Pool(appConfig(databaseName))

    return {
      databaseName,
      owner,
      app,
      close: async () => {
        await Promise.allSettled([owner!.end(), app!.end()])
        await root.query(`DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`)
        await root.end()
      },
    }
  } catch (error) {
    await Promise.allSettled([owner?.end(), app?.end()])
    await root.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`)
    await root.end()
    throw error
  }
}
