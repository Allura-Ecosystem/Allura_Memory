"use client"

import { createContext, useCallback, useContext, useState } from "react"
import type { ReactNode } from "react"

export type InspectorView = "run" | "work-item" | "project" | "evidence" | "handoff" | "memory"

export interface InspectorEntity {
  type: InspectorView
  id: string
  /** Optional display label, shown alongside the ID */
  label?: string
}

interface InspectorContextValue {
  isOpen: boolean
  entity: InspectorEntity | null
  open: (entity: InspectorEntity) => void
  close: () => void
  toggle: () => void
}

const InspectorContext = createContext<InspectorContextValue | null>(null)

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [entity, setEntity] = useState<InspectorEntity | null>(null)

  const open = useCallback((nextEntity: InspectorEntity) => {
    setEntity(nextEntity)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  return (
    <InspectorContext.Provider value={{ isOpen, entity, open, close, toggle }}>
      {children}
    </InspectorContext.Provider>
  )
}

export function useInspector(): InspectorContextValue {
  const ctx = useContext(InspectorContext)
  if (!ctx) {
    throw new Error("useInspector must be used inside <InspectorProvider>")
  }
  return ctx
}
