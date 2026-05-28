"use client"

import { Zap } from "lucide-react"
import { useEffect, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { Skill } from "@/app/api/skills/route"

type FilterSource = "all" | "opencode" | "claude"

const FILTER_PILLS: { label: string; value: FilterSource }[] = [
  { label: "All", value: "all" },
  { label: "OpenCode", value: "opencode" },
  { label: "Claude", value: "claude" },
]

function SkillCard({ skill }: { skill: Skill }) {
  return (
    <article className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--allura-blue)] text-white">
          <Zap className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{skill.name}</span>
            <span
              className={
                skill.source === "opencode"
                  ? "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--allura-blue)] text-white"
                  : "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--allura-gray-200)] text-[var(--allura-gray-500)]"
              }
            >
              {skill.source}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs text-[var(--dashboard-text-secondary)]">{skill.description}</p>
          <p className="mt-3 text-xs text-[var(--dashboard-text-muted)]">
            {skill.agents.length > 0 ? `Agents: ${skill.agents.join(", ")}` : "Agents: none assigned"}
          </p>
        </div>
      </div>
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      </div>
    </div>
  )
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [filter, setFilter] = useState<FilterSource>("all")

  useEffect(() => {
    fetch("/api/skills")
      .then((res) => res.json() as Promise<Skill[]>)
      .then(setSkills)
      .catch(() => setSkills([]))
  }, [])

  const filtered =
    skills === null
      ? null
      : filter === "all"
        ? skills
        : skills.filter((s) => s.source === filter)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Skills</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Capabilities available to your agents</p>
      </div>

      <div className="flex gap-2">
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill.value}
            onClick={() => setFilter(pill.value)}
            className={
              filter === pill.value
                ? "rounded-full px-4 py-1.5 text-xs font-medium bg-[var(--allura-blue)] text-white transition-colors"
                : "rounded-full px-4 py-1.5 text-xs font-medium bg-[var(--allura-gray-100)] text-[var(--dashboard-text-secondary)] hover:bg-[var(--allura-gray-200)] transition-colors"
            }
          >
            {pill.label}
          </button>
        ))}
      </div>

      {filtered === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] py-16">
          <Zap className="mb-3 size-8 text-[var(--dashboard-text-muted)]" />
          <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No skills found</p>
          <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
            No skills match the selected filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((skill) => (
            <SkillCard key={`${skill.source}:${skill.id}`} skill={skill} />
          ))}
        </div>
      )}
    </div>
  )
}
