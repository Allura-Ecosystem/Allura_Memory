"use client"

import { CheckCircle, MinusCircle, RefreshCw, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"

import type { ComponentHealth } from "@/app/api/health/route"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"


function StatusBadge({ status }: { status: string }) {
  if (status === "healthy") {
    return (
      <Badge className="border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400">
        <CheckCircle className="mr-1 size-3" />
        healthy
      </Badge>
    )
  }
  if (status === "degraded") {
    return (
      <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
        <MinusCircle className="mr-1 size-3" />
        degraded
      </Badge>
    )
  }
  return (
    <Badge variant="destructive">
      <XCircle className="mr-1 size-3" />
      unhealthy
    </Badge>
  )
}

export function RefreshButton() {
  const router = useRouter()
  return (
    <Button variant="outline" size="sm" onClick={() => router.refresh()}>
      <RefreshCw className="mr-1.5 size-3.5" />
      Refresh
    </Button>
  )
}

export function HealthTable({ components }: { components: ComponentHealth[] }) {
  if (components.length === 0) {
    return (
      <div className="rounded-lg border bg-[var(--dashboard-surface)] p-8 text-center text-sm text-[var(--dashboard-text-secondary)]">
        No component data available. The health endpoint may be unreachable.
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-[var(--dashboard-surface)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Latency (ms)</TableHead>
            <TableHead>Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {components.map((component) => (
            <TableRow key={component.name}>
              <TableCell className="font-mono text-xs">{component.name}</TableCell>
              <TableCell>
                <StatusBadge status={component.status} />
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {component.latency != null ? `${component.latency}ms` : "—"}
              </TableCell>
              <TableCell className="max-w-xs truncate text-xs text-[var(--dashboard-text-secondary)]">
                {component.message ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
