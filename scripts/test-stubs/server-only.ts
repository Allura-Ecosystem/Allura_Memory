// Test-only stub for the `server-only` import guard. The unit lane runs in a
// plain Node environment where the real package throws by design; aliasing it
// here lets tests import server-guarded modules directly. Production builds
// are unaffected — this file is never referenced outside vitest configs.
export {}