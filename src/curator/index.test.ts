import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/postgres/connection", () => ({
  closePool: vi.fn(),
  getPool: vi.fn(),
}));

import { runCurator } from "./index";
import { closePool, getPool } from "../lib/postgres/connection";

describe("runCurator", () => {
  it("rejects the disabled CLI before constructing an owner pool", async () => {
    await expect(runCurator()).rejects.toThrow("server-resolved workspace scope");

    expect(getPool).not.toHaveBeenCalled();
    expect(closePool).not.toHaveBeenCalled();
  });
});
