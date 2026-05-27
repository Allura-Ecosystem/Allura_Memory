import { redirect } from "next/navigation"

// Skills page has moved to /dashboard/skills (canonical route).
export default function BuilderPage() {
  redirect("/dashboard/skills")
}
