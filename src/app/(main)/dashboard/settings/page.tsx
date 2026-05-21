"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Dashboard configuration.</p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardHeader>
          <CardTitle className="text-base text-[var(--dashboard-text-primary)]">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            Settings will be configured here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
