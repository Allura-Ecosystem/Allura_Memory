"use client"

import { useCallback, useEffect, useState } from "react"
import type { ReactElement } from "react"

type Role = "admin" | "curator" | "viewer"

interface Member {
  id: string
  user_id: string
  email: string | null
  role: Role
  created_at: string
}

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full control" },
  { value: "curator", label: "Curator", hint: "Can approve" },
  { value: "viewer", label: "Viewer", hint: "Read only" },
]

export default function MembersClient(): ReactElement {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [newPerson, setNewPerson] = useState("")
  const [newRole, setNewRole] = useState<Role>("viewer")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/members", { headers: { Accept: "application/json" } })
      if (res.status === 401 || res.status === 403) {
        setError("Only an admin can manage members.")
        setMembers([])
        return
      }
      if (!res.ok) throw new Error(`Couldn't load members (${res.status})`)
      const data = (await res.json()) as { members: Member[] }
      setMembers(data.members ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load members.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addMember(): Promise<void> {
    const person = newPerson.trim()
    if (!person) return
    setBusy(true)
    setError(null)
    try {
      const isEmail = person.includes("@")
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: person, email: isEmail ? person : null, role: newRole }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Couldn't add member (${res.status})`)
      }
      setNewPerson("")
      setNewRole("viewer")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add member.")
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(userId: string, role: Role): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error(`Couldn't change role (${res.status})`)
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change role.")
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(userId: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(userId)}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`Couldn't remove member (${res.status})`)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove member.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-enter" style={{ padding: "28px 30px 60px", maxWidth: 980, margin: "0 auto", fontFamily: "var(--sans)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-blue)", marginBottom: 4 }}>
        Team
      </div>
      <h1 style={{ margin: 0, fontSize: 27, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--c-ink)" }}>
        Members &amp; Roles
      </h1>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--c-muted)" }}>
        Add people to your team and choose what each person can do. No code needed.
      </p>

      {/* Add member */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          background: "var(--c-card)",
          border: "1px solid var(--c-border)",
          borderRadius: 14,
          padding: "16px 18px",
          margin: "20px 0 18px",
        }}
      >
        <input
          value={newPerson}
          onChange={(e) => setNewPerson(e.target.value)}
          placeholder="Email or username"
          aria-label="New member email or username"
          style={{
            flex: 1,
            minWidth: 220,
            height: 40,
            padding: "0 12px",
            border: "1px solid var(--c-border)",
            borderRadius: 10,
            fontFamily: "var(--sans)",
            fontSize: 14,
            color: "var(--c-ink)",
            background: "var(--c-bg)",
          }}
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as Role)}
          aria-label="Role for new member"
          style={{
            height: 40,
            padding: "0 12px",
            border: "1px solid var(--c-border)",
            borderRadius: 10,
            fontFamily: "var(--sans)",
            fontSize: 14,
            color: "var(--c-ink)",
            background: "var(--c-bg)",
          }}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label} — {r.hint}
            </option>
          ))}
        </select>
        <button
          onClick={() => void addMember()}
          disabled={busy || newPerson.trim().length === 0}
          style={{
            height: 40,
            padding: "0 18px",
            border: "none",
            borderRadius: 10,
            background: "var(--c-ink)",
            color: "#fff",
            fontFamily: "var(--sans)",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy || newPerson.trim().length === 0 ? "default" : "pointer",
            opacity: busy || newPerson.trim().length === 0 ? 0.5 : 1,
          }}
        >
          Add person
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: "var(--c-red)", background: "var(--c-red-soft)", border: "1px solid var(--c-border)", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Member list */}
      <div style={{ background: "var(--c-card)", border: "1px solid var(--c-border)", borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "20px", fontSize: 13, color: "var(--c-muted)" }}>Loading members…</div>
        ) : members.length === 0 ? (
          <div style={{ padding: "20px", fontSize: 13, color: "var(--c-muted)" }}>
            No one on the team yet. Add your first person above.
          </div>
        ) : (
          members.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 18px",
                borderTop: i === 0 ? "none" : "1px solid var(--c-border-soft)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--c-ink)" }}>{m.email ?? m.user_id}</div>
                {m.email && <div style={{ fontSize: 12, color: "var(--c-muted)", fontFamily: "var(--mono)" }}>{m.user_id}</div>}
              </div>
              <select
                value={m.role}
                onChange={(e) => void changeRole(m.user_id, e.target.value as Role)}
                disabled={busy}
                aria-label={`Role for ${m.email ?? m.user_id}`}
                style={{
                  height: 34,
                  padding: "0 10px",
                  border: "1px solid var(--c-border)",
                  borderRadius: 9,
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  color: "var(--c-ink)",
                  background: "var(--c-bg)",
                }}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void removeMember(m.user_id)}
                disabled={busy}
                style={{
                  height: 34,
                  padding: "0 12px",
                  border: "1px solid var(--c-border)",
                  borderRadius: 9,
                  background: "var(--c-card)",
                  color: "var(--c-red)",
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: busy ? "default" : "pointer",
                }}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--c-muted)", margin: "16px 0 0", lineHeight: 1.5 }}>
        <strong>Admin</strong> can do everything. <strong>Curator</strong> can approve what becomes saved knowledge.
        <strong> Viewer</strong> can look but not change. Only admins can manage this page.
      </p>
    </div>
  )
}
