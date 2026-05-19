import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  buildBoardEvidencePanels,
  buildBoardSwitcherItems,
  createDefaultBoardRegistry,
  getBoardConfig,
  getBoardStatusModel,
  getBoardVisibilityLabel,
  listBoardIds,
} from "@/lib/boards"

type BoardDetailPageProps = {
  params: Promise<{
    boardId: string
  }>
}

export function generateStaticParams() {
  return listBoardIds().map((boardId) => ({ boardId }))
}

export async function generateMetadata({ params }: { params: Promise<{ boardId: string }> }): Promise<Metadata> {
  const { boardId } = await params
  const board = getBoardConfig(boardId)

  if (!board) {
    return {
      title: "Allura Boards",
      description: "Config-driven boards for Allura Memory.",
    }
  }

  return {
    title: `${board.title} | Allura Boards`,
    description: board.summary,
  }
}

export default async function BoardDetailPage({ params }: BoardDetailPageProps) {
  const { boardId } = await params
  const registry = createDefaultBoardRegistry()
  const board = getBoardConfig(boardId, registry)

  if (!board) {
    notFound()
  }

  const switcherItems = buildBoardSwitcherItems(registry)
  const status = getBoardStatusModel(board)
  const evidencePanels = buildBoardEvidencePanels(board)

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <Badge variant="outline">{getBoardVisibilityLabel(board)}</Badge>
          <Badge variant={board.source.public ? "default" : "secondary"}>{board.source.label}</Badge>
          <Badge variant="outline">{board.source.type}</Badge>
          <Badge variant={board.writePolicy.requiresHumanApproval ? "secondary" : "default"}>{board.writePolicy.mode}</Badge>
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-[var(--dashboard-text-primary)]">{board.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--dashboard-text-secondary)]">{board.summary}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge variant="outline">Source: {board.source.reference}</Badge>
          <Badge variant="outline">Audit: {board.writePolicy.auditTarget}</Badge>
          <Badge variant="outline">Evidence: {board.evidencePolicy.receiptFormat}</Badge>
        </div>
      </div>

      <section className="rounded-3xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--dashboard-text-muted)]">Board switcher</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--dashboard-text-primary)]">Switch to another board</h2>
          </div>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">The list below is built from the current registry.</p>
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {switcherItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`min-w-[14rem] rounded-2xl border p-4 transition-colors ${
                item.id === board.id
                  ? "border-[var(--dashboard-text-primary)]/40 bg-[var(--dashboard-surface-alt)]"
                  : "border-[var(--dashboard-border)] bg-[var(--dashboard-surface-alt)]/60 hover:border-[var(--dashboard-text-primary)]/30 hover:bg-[var(--dashboard-surface-alt)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{item.title}</p>
                  <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">{item.sourceLabel}</p>
                </div>
                <Badge variant={item.id === board.id ? "default" : "outline"}>{item.statusLabel}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline">{item.sourceType}</Badge>
                <Badge variant={item.publicLabel === "Public" ? "default" : "secondary"}>{item.publicLabel}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-[var(--dashboard-text-primary)]">Status and contract</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-[var(--dashboard-text-secondary)]">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">Board status</div>
              <div className="mt-1 text-[var(--dashboard-text-primary)]">{status.label}</div>
              <p className="mt-1 leading-6">{status.description}</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">Route</div>
              <div className="mt-1 font-mono text-[var(--dashboard-text-primary)]">/boards/{board.id}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">Source of truth</div>
              <div className="mt-1 text-[var(--dashboard-text-primary)]">{board.source.label}</div>
              <p className="mt-1 leading-6">{board.source.reference}</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">Write policy</div>
              <div className="mt-1 text-[var(--dashboard-text-primary)]">{board.writePolicy.mode}</div>
              <p className="mt-1 leading-6">{board.evidencePolicy.receiptFormat}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
            <CardHeader>
              <CardTitle className="text-[var(--dashboard-text-primary)]">Evidence panels</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {evidencePanels.map((panel) => (
                <div key={panel.title} className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-alt)]/40 p-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{panel.title}</h3>
                    <p className="text-xs leading-5 text-[var(--dashboard-text-secondary)]">{panel.description}</p>
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    {panel.entries.map((entry) => (
                      <div key={`${panel.title}-${entry.label}`} className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]/60 p-3">
                        <dt className="text-xs uppercase tracking-wide text-[var(--dashboard-text-muted)]">{entry.label}</dt>
                        <dd className="mt-1 text-[var(--dashboard-text-primary)]">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
            <CardHeader>
              <CardTitle className="text-[var(--dashboard-text-primary)]">Board lanes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {board.sections.map((section) => (
                <div key={section.id} className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-alt)]/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{section.title}</h3>
                    <Badge variant="outline">{section.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--dashboard-text-secondary)]">{section.description}</p>
                  <div className="mt-4 rounded-lg border border-dashed border-[var(--dashboard-border)] px-3 py-4 text-xs text-[var(--dashboard-text-muted)]">
                    {section.emptyMessage}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
