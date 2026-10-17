import { closePool, isPoolHealthy } from "@/lib/postgres/connection";

interface HealthSummary {
  postgres: boolean;
  healthy: boolean;
}

async function main(): Promise<void> {
  try {
    const postgres = await isPoolHealthy();
    const summary: HealthSummary = {
      postgres,
      healthy: postgres,
    };

    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.exitCode = summary.healthy ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([closePool()]);
  }
}

void main();
