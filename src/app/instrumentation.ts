import { initSentry } from "@/lib/observability/sentry"

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  initSentry()
}
