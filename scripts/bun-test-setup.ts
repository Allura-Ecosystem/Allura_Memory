import { vi } from "vitest"

type MutableVitest = Record<string, unknown> & typeof vi

const mutableVi = vi as MutableVitest
const originalGlobals = new Map<string, unknown>()

// Bun's native `bun test` runner can execute files that import Vitest's `vi`,
// but its compatibility surface is smaller than Vitest's runner. The final
// regression gate intentionally exercises `bun test`, so provide conservative
// no-op/polyfill shims for helper APIs used by older tests. These shims keep
// Bun-native execution focused on product behavior instead of runner API drift.

if (typeof mutableVi.resetModules !== "function") {
  mutableVi.resetModules = (() => {
    return mutableVi
  }) as unknown as typeof vi.resetModules
}

if (typeof mutableVi.importActual !== "function") {
  mutableVi.importActual = (async (specifier: string) => {
    return import(specifier)
  }) as unknown as typeof vi.importActual
}

if (typeof mutableVi.doMock !== "function") {
  mutableVi.doMock = ((specifier: string, factory: () => unknown) => {
    mutableVi.mock?.(specifier, factory as never)
    return mutableVi
  }) as unknown as typeof vi.doMock
}

if (typeof mutableVi.hoisted !== "function") {
  mutableVi.hoisted = ((factory: () => unknown) => factory()) as unknown as typeof vi.hoisted
}

if (typeof mutableVi.mocked !== "function") {
  mutableVi.mocked = ((item: unknown) => item) as unknown as typeof vi.mocked
}

if (typeof mutableVi.stubGlobal !== "function") {
  mutableVi.stubGlobal = ((name: string | number | symbol, value: unknown) => {
    const key = String(name)
    if (!originalGlobals.has(key)) {
      originalGlobals.set(key, globalThis[key as keyof typeof globalThis])
    }

    Object.defineProperty(globalThis, key,
      {
      configurable: true,
      writable: true,
      value,
    })

    return mutableVi
  }) as unknown as typeof vi.stubGlobal
}

if (typeof mutableVi.unmock !== "function") {
  mutableVi.unmock = (() => mutableVi) as unknown as typeof vi.unmock
}

if (typeof mutableVi.runAllTimersAsync !== "function") {
  mutableVi.runAllTimersAsync = (async () => {
    mutableVi.runAllTimers?.()
    return mutableVi
  }) as unknown as typeof vi.runAllTimersAsync
}

// Bun's native `bun test` runner does not apply Vitest's `vi.mock`, so modules
// that import the `server-only` guard throw at import time. Mock it to a no-op
// here so Bun-native execution can load server-only modules (the guard is a
// build-time boundary, not a runtime behavior under test).
try {
  const { mock } = await import("bun:test")
  mock.module("server-only", () => ({}))
} catch {
  // Not running under Bun's native test runner; nothing to shim.
}
