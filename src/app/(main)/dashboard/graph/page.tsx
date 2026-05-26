import { redirect } from "next/navigation"

// Memory Graph has moved to /dashboard/memory-space (canonical graph route).
export default function GraphPage() {
  redirect("/dashboard/memory-space")
}
