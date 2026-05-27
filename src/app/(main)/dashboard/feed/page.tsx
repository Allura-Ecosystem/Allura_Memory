import { redirect } from "next/navigation"

// Memory Feed has moved to /dashboard/memory (canonical route).
export default function FeedPage() {
  redirect("/dashboard/memory")
}
