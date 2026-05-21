"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function FeedPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Feed</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Activity feed is planned for Phase 4.</p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardHeader>
          <CardTitle className="text-base text-[var(--dashboard-text-primary)]">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            Recent activity feed will be implemented in a future phase.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
