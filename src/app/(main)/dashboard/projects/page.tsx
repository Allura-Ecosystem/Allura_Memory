"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Projects</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Project management is handled via the board config engine (Phase 1).</p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardHeader>
          <CardTitle className="text-base text-[var(--dashboard-text-primary)]">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            Project boards will be available once the board config engine is implemented.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
