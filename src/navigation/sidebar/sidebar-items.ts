import type { LucideIcon } from "lucide-react"
import { Activity, Brain, FileText, FolderKanban, Hammer, Lightbulb, Settings, Users } from "lucide-react"

export type SidebarSubItem = {
  title: string
  url: string
  icon?: LucideIcon
}

export type SidebarItem = {
  title: string
  url: string
  icon: LucideIcon
  subItems?: SidebarSubItem[]
}

export type SidebarGroup = {
  label: string
  items: SidebarItem[]
}

export const sidebarItems: SidebarGroup[] = [
  {
    label: "Primary",
    items: [
      {
        title: "Memories",
        url: "/dashboard/feed",
        icon: Brain,
      },
      {
        title: "Insights",
        url: "/dashboard/insights",
        icon: Lightbulb,
      },
      {
        title: "Projects",
        url: "/dashboard/projects",
        icon: FolderKanban,
      },
      {
        title: "Agents",
        url: "/dashboard/agents",
        icon: Users,
      },
      {
        title: "Decisions",
        url: "/dashboard/decisions",
        icon: FileText,
        subItems: [
          {
            title: "Decision Records",
            url: "/dashboard/decisions",
            icon: FileText,
          },
          {
            title: "Insight Builder",
            url: "/dashboard/builder",
            icon: Hammer,
          },
        ],
      },
      {
        title: "Settings",
        url: "/dashboard/settings",
        icon: Settings,
        subItems: [
          {
            title: "Preferences",
            url: "/dashboard/settings",
            icon: Settings,
          },
          {
            title: "System Health",
            url: "/dashboard/health",
            icon: Activity,
          },
        ],
      },
    ],
  },
]
