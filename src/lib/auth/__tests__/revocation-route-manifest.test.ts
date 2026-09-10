import { expect, it } from "vitest"
import { ROUTE_SCOPE_MANIFEST } from "../route-scope-manifest"

it("declares Story 29.15 authenticated principal lifecycle routes", () => {
  expect(ROUTE_SCOPE_MANIFEST).toEqual(expect.arrayContaining([
    expect.objectContaining({ pattern: "/api/device-pairing/revoke", methods: ["POST"], authStrategy: "principal" }),
    expect.objectContaining({ pattern: "/api/device-pairing/mark-lost", methods: ["POST"], authStrategy: "principal" }),
    expect.objectContaining({ pattern: "/api/device-pairing/devices", methods: ["GET"], authStrategy: "principal" }),
  ]))
})
