import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

interface VisibilityManifest {
  dataset: string
  expectedDocumentCount: number
  expectedMembershipCount: number
  principals: Record<string, string[]>
  sentinels: Record<string, {
    id: string
    tenantId: string
    workspaceId: string
    ownerId: string
  }>
  scopeScenarios: Array<{ expectedDocumentIds: string[] }>
}

const fixturePath = path.resolve(process.cwd(), "docker/epic30-postgres/99-epic30-synthetic-fixtures.sql")
const manifestPath = path.resolve(process.cwd(), "docker/epic30-postgres/epic30-synthetic-visibility-manifest.json")
const dockerfilePath = path.resolve(process.cwd(), "docker/portfolio-postgres/Dockerfile")

const fixture = readFileSync(fixturePath, "utf8")
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as VisibilityManifest
const dockerfile = readFileSync(dockerfilePath, "utf8")

describe("Epic 30 synthetic fixture contract", () => {
  it("requires a fresh owned receipt before authority-resetting replay", () => {
    expect(fixture).toContain("epic30_local.ownership")
    expect(fixture.indexOf("epic30_local.ownership")).toBeLessThan(fixture.indexOf("INSERT INTO workspaces"))
    expect(fixture).toContain("authority-resetting")
  })
  it("labels the dataset as synthetic and uses reserved invalid email domains", () => {
    expect(manifest.dataset).toBe("EPIC 30 SYNTHETIC TEST DATA ONLY")
    expect(fixture).toContain("EPIC 30 SYNTHETIC TEST DATA ONLY")
    expect(fixture).not.toMatch(/@[a-z0-9.-]+\.(com|org|net|io|co)'/i)
    expect(fixture.match(/@example\.invalid/g)).toHaveLength(manifest.expectedMembershipCount)
  })

  it("declares every expected visible document in the SQL fixture", () => {
    const expectedIds = new Set([
      ...Object.values(manifest.principals).flat(),
      ...manifest.scopeScenarios.flatMap(({ expectedDocumentIds }) => expectedDocumentIds),
    ])

    for (const id of expectedIds) {
      expect(fixture).toContain(`'${id}'`)
    }
    expect(manifest.expectedDocumentCount).toBe(10)
  })

  it("declares exact scope and owner proof for every negative-boundary sentinel", () => {
    expect(Object.keys(manifest.sentinels).sort()).toEqual(["crossTenant", "crossWorkspace"])
    for (const sentinel of Object.values(manifest.sentinels)) {
      expect(fixture).toContain(`'${sentinel.id}'`)
      expect(fixture).toContain(`'${sentinel.tenantId}'`)
      expect(fixture).toContain(`'${sentinel.workspaceId}'`)
      expect(fixture).toContain(`'${sentinel.ownerId}'`)
    }
  })

  it("gives positive boundary-sentinel owners active tenant membership", () => {
    const membershipInsert = fixture.split("INSERT INTO memberships (")[1].split("ON CONFLICT")[0]
    for (const sentinel of Object.values(manifest.sentinels)) {
      const tuple = membershipInsert.split("\n").find(line => line.includes(`('${sentinel.tenantId}', '${sentinel.ownerId}',`))
      expect(tuple).toMatch(/NULL\),?$/)
    }
  })

  it("seeds without rewriting a conflicting workspace tenant", () => {
    expect(fixture).toMatch(/^BEGIN;/m)
    expect(fixture).toMatch(/^COMMIT;/m)
    expect(fixture).toContain("WHERE workspaces.group_id = EXCLUDED.group_id")
    expect(fixture).toContain("already belongs to another tenant")
    expect(fixture).toContain("synthetic document scope conflicts with an existing row")
  })

  it("is not auto-replayed by the general portfolio database image", () => {
    expect(dockerfile).not.toContain(
      "COPY docker/epic30-postgres/99-epic30-synthetic-fixtures.sql /docker-entrypoint-initdb.d/98-epic30-synthetic-fixtures.sql",
    )
  })
})
