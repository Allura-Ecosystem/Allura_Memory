import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  buildBoardSwitcherItems,
  createDefaultBoardRegistry,
  getBoardStatusModel,
  getBoardVisibilityLabel,
} from "@/lib/boards"

export default function BoardsPage() {
  const registry = createDefaultBoardRegistry()
  const switcherItems = buildBoardSwitcherItems(registry)

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--dashboard-border)] bg-[linear-gradient(135deg,rgba(21,96,189,0.14),rgba(244,180,0,0.08),rgba(0,0,0,0))] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--dashboard-text-muted)]">Phase 2 board cockpit</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--dashboard-text-primary)]">Boards are switchable, status-aware, and evidence-backed.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--dashboard-text-secondary)]">
          This slice uses the existing board config registry to surface a board switcher, a derived status model, source-of-truth
          badges, and evidence panels without introducing a new schema.
        </p>
      </div>

      <section className="rounded-3xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--dashboard-text-muted)]">Board switcher</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--dashboard-text-primary)]">Jump between configured boards</h2>
          </div>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">Derived state comes from the current registry entries.</p>
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {switcherItems.map((item) => {
            const status = getBoardStatusModel(registry.byId[item.id]!)

            return (
              <Link
                key={item.id}
                href={item.href}
                className="min-w-[15rem] rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-alt)]/60 p-4 transition-colors hover:border-[var(--dashboard-text-primary)]/30 hover:bg-[var(--dashboard-surface-alt)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">{item.sourceLabel}</p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="outline">{item.sourceType}</Badge>
                  <Badge variant={item.publicLabel === "Public" ? "default" : "secondary"}>{item.publicLabel}</Badge>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {registry.boards.map((board) => (
          <Card key={board.id} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{getBoardVisibilityLabel(board)}</Badge>
                <Badge variant={board.source.public ? "default" : "secondary"}>{board.source.label}</Badge>
                <Badge variant="outline">{board.source.type}</Badge>
                <Badge variant="outline">{board.adapter}</Badge>
                <Badge variant={board.writePolicy.requiresHumanApproval ? "secondary" : "default"}>
                  {board.writePolicy.mode}
                </Badge>
              </div>
              <CardTitle className="text-[var(--dashboard-text-primary)]">{board.title}</CardTitle>
              <p className="text-sm leading-6 text-[var(--dashboard-text-secondary)]">{board.summary}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-[var(--dashboard-border)] p-3">
                  <dt className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">Route</dt>
                  <dd className="mt-1 font-mono text-[var(--dashboard-text-primary)]">/boards/{board.id}</dd>
                </div>
                <div className="rounded-lg border border-[var(--dashboard-border)] p-3">
                  <dt className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">Board status</dt>
                  <dd className="mt-1 text-[var(--dashboard-text-primary)]">{getBoardStatusModel(board).label}</dd>
                </div>
                <div className="rounded-lg border border-[var(--dashboard-border)] p-3">
                  <dt className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">Sections</dt>
                  <dd className="mt-1 text-[var(--dashboard-text-primary)]">{board.sections.length}</dd>
                </div>
                <div className="rounded-lg border border-[var(--dashboard-border)] p-3">
                  <dt className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">Source truth</dt>
                  <dd className="mt-1 text-[var(--dashboard-text-primary)]">{board.source.label}</dd>
                </div>
              </dl>
              <Link
                href={`/boards/${board.id}`}
                className="inline-flex items-center rounded-md border border-[var(--dashboard-border)] px-3 py-2 text-sm font-medium text-[var(--dashboard-text-primary)] transition-colors hover:bg-[var(--dashboard-surface-alt)]"
              >
                Open board
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
