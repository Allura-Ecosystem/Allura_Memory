import {
  Activity,
  BookOpen,
  Brain,
  CheckCircle2,
  Folder,
  Network,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react"

export interface NavSubItem {
  title: string
  url: string
  icon?: LucideIcon
}

export interface NavMainItem {
  title: string
  url: string
  icon?: LucideIcon
  subItems?: NavSubItem[]
}

export interface NavGroup {
  id: number
  label?: string
  items: NavMainItem[]
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Work",
    items: [
      { title: "What We Know", url: "/dashboard/feed", icon: Brain },
      { title: "Memory Space", url: "/dashboard/memory-space", icon: Network },
      { title: "Decisions", url: "/dashboard/insights", icon: CheckCircle2 },
      { title: "Projects", url: "/dashboard/projects", icon: Folder },
      { title: "Team", url: "/dashboard/agents", icon: Users },
    ],
  },
  {
    id: 2,
    label: "Tools",
    items: [
      {
        title: "Records",
        url: "/dashboard/decisions",
        icon: BookOpen,
        subItems: [
          { title: "Decision Records", url: "/dashboard/decisions" },
          { title: "Insight Builder", url: "/dashboard/skills", icon: Activity },
        ],
      },
    ],
  },
  {
    id: 3,
    label: "System",
    items: [
      {
        title: "Preferences",
        url: "/dashboard/settings",
        icon: Settings,
        subItems: [
          { title: "Settings", url: "/dashboard/settings" },
          { title: "Health", url: "/dashboard/health", icon: Activity },
          { title: "Audit", url: "/dashboard/audit", icon: BookOpen },
        ],
      },
    ],
  },
]
