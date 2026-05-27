"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function DecisionsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Decisions</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">This surface has been deprecated.</p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardHeader>
          <CardTitle className="text-base text-[var(--dashboard-text-primary)]">Deprecated</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            The decisions surface is no longer part of the Allura dashboard.
            Use Insights or Builder instead.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
