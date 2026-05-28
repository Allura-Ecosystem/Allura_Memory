/**
 * AI-Assisted Documentation
 * Portions of this API surface were drafted with AI assistance and reviewed
 * against the repository's runtime adapter boundary rules. When in doubt,
 * defer to code, schemas, and team consensus.
 */
import { existsSync } from "fs"
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import { NextResponse } from "next/server"

export interface Skill {
  id: string
  name: string
  description: string
  source: "opencode" | "claude"
  agents: string[]
}

function toTitleCase(id: string): string {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function parseDescription(content: string): string {
  const lines = content.split("\n")

  // Skip frontmatter (---...---) if present
  let startIndex = 0
  if (lines[0]?.trim() === "---") {
    const fmEnd = lines.findIndex((line, i) => i > 0 && line.trim() === "---")
    if (fmEnd !== -1) {
      startIndex = fmEnd + 1
    }
  }

  // Skip the title line (starts with #)
  let bodyStart = startIndex
  for (let i = startIndex; i < lines.length; i++) {
    if (lines[i]?.trim().startsWith("#")) {
      bodyStart = i + 1
      break
    }
  }

  // Collect the first non-empty paragraph
  const paragraphLines: string[] = []
  let inParagraph = false

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const trimmed = line.trim()

    if (!inParagraph) {
      if (trimmed.length > 0 && !trimmed.startsWith("#")) {
        inParagraph = true
        paragraphLines.push(trimmed)
      }
    } else {
      if (trimmed.length === 0) {
        break
      }
      paragraphLines.push(trimmed)
    }
  }

  return paragraphLines.join(" ") || "No description available."
}

async function scanSkillDirectory(dir: string, source: "opencode" | "claude"): Promise<Skill[]> {
  if (!existsSync(dir)) {
    return []
  }

  const skills: Skill[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  await Promise.all(
    entries.map(async (entry) => {
      const skillDir = join(dir, entry)
      const skillMdPath = join(skillDir, "SKILL.md")

      if (!existsSync(skillMdPath)) {
        return
      }

      try {
        const content = await readFile(skillMdPath, "utf-8")
        const description = parseDescription(content)

        skills.push({
          id: entry,
          name: toTitleCase(entry),
          description,
          source,
          agents: [],
        })
      } catch {
        // Skip unreadable skill files silently
      }
    }),
  )

  return skills
}

export async function GET(): Promise<NextResponse<Skill[]>> {
  const base = process.cwd()

  const [opencodeSkills, claudeSkills] = await Promise.all([
    scanSkillDirectory(join(base, ".opencode", "skills"), "opencode"),
    scanSkillDirectory(join(base, ".claude", "skills"), "claude"),
  ])

  const allSkills = [...opencodeSkills, ...claudeSkills].sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json(allSkills)
}
