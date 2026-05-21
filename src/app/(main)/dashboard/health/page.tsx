"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function HealthPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Health</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">System health is monitored, not surfaced as a primary view.</p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardHeader>
          <CardTitle className="text-base text-[var(--dashboard-text-primary)]">Redirected</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            System status is available via the API. Dashboard focuses on memory governance.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
