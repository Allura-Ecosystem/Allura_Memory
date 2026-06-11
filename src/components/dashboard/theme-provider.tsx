"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"

type Theme = "light" | "dark" | "system"

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: "light" | "dark"
}

const STORAGE_KEY = "allura-theme"

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
})

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "light"
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  return theme
}

function applyTheme(resolved: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", resolved)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")

  // Initialize from localStorage on mount
  useEffect(() => {
    let stored: string | null = null
    try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* restricted context */ }
    const initial: Theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system"
    const resolved = resolveTheme(initial)
    setThemeState(initial)
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  // Listen for system preference changes when theme is "system"
  useEffect(() => {
    if (theme !== "system") return

    const mql = window.matchMedia("(prefers-color-scheme: dark)")

    function handleChange() {
      const resolved = resolveTheme("system")
      setResolvedTheme(resolved)
      applyTheme(resolved)
    }

    mql.addEventListener("change", handleChange)
    return () => mql.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* restricted context */ }
    const resolved = resolveTheme(next)
    setThemeState(next)
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
