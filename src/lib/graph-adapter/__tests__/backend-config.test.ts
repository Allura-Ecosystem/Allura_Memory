import { afterEach, describe, expect, it } from "vitest"
import { getGraphBackend } from "../factory"

const original = process.env.GRAPH_BACKEND
afterEach(() => {
  if (original === undefined) delete process.env.GRAPH_BACKEND
  else process.env.GRAPH_BACKEND = original
})

describe("graph backend configuration", () => {
  it("defaults only for unset or empty configuration", () => {
    delete process.env.GRAPH_BACKEND
    expect(getGraphBackend()).toBe("ruvector")
    process.env.GRAPH_BACKEND = ""
    expect(getGraphBackend()).toBe("ruvector")
  })
  it.each(["ruvector", "ruvector-crate"])("supports %s", (backend) => {
    process.env.GRAPH_BACKEND = backend
    expect(getGraphBackend()).toBe(backend)
  })
  it.each(["neo4j", "definitely-invalid", " ", "ruvector "])("fails closed for unsupported config %s", (backend) => {
    process.env.GRAPH_BACKEND = backend
    expect(() => getGraphBackend()).toThrow("Unsupported graph backend configuration")
  })
})
