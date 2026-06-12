import { redirect } from "next/navigation"

export default function GovernancePage(): never {
  redirect("/dashboard/approvals")
}
