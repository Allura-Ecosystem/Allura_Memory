import { redirect } from "next/navigation"

/**
 * Legacy kanban route — replaced by /dashboard/work-board in Phase 2.
 * Redirects to avoid dead links.
 */
export default function KanbanPage() {
  redirect("/dashboard/work-board")
}
