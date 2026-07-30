import { closeDriver, isDriverHealthy } from "./lib/neo4j-stub";
import { closePool, isPoolHealthy } from "@/lib/postgres/connection";

interface HealthSummary {
  postgres: boolean;
  neo4j: boolean;
  healthy: boolean;
}

async function main(): Promise<void> {
  let summary: HealthSummary = {
    postgres: false,
    neo4j: false,
    healthy: false,
  };

  try {
    const [postgres, neo4j] = await Promise.all([isPoolHealthy(), isDriverHealthy()]);
    summary = {
      postgres,
      neo4j,
      healthy: postgres && neo4j,
    };

    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.exitCode = summary.healthy ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([closePool(), closeDriver()]);
  }
}

void main();
