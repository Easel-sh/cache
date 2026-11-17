import { describe, expect, it } from "vitest";
import { isKey, isWithin, planMounts } from "./mounts.mjs";

const env = { home: "/home/runner", workspace: "/home/runner/work/app/app" };
const vol = "/easel/cache/rust";

describe("planMounts", () => {
  it("resolves paths as a step's shell would and places them on the key's volume", () => {
    expect(planMounts("~/.cargo/registry\ntarget\n/var/cache/apt/archives\n", vol, env)).toEqual([
      { source: "/easel/cache/rust/home/runner/.cargo/registry", target: "/home/runner/.cargo/registry" },
      { source: "/easel/cache/rust/var/cache/apt/archives", target: "/var/cache/apt/archives" },
      { source: "/easel/cache/rust/home/runner/work/app/app/target", target: "/home/runner/work/app/app/target" },
    ]);
  });

  it("mounts parents before children, once each", () => {
    const plan = planMounts("~/.cargo/registry\n~/.cargo\n~/.cargo/\n", vol, env);
    expect(plan.map((m) => m.target)).toEqual(["/home/runner/.cargo", "/home/runner/.cargo/registry"]);
    expect(plan[0].source).toBe("/easel/cache/rust/home/runner/.cargo");
  });

  it("refuses what it can't do safely", () => {
    expect(() => planMounts("", vol, env)).toThrow(/at least one/);
    expect(() => planMounts("/", vol, env)).toThrow(/root/);
    expect(() => planMounts("/easel/cache/x", vol, env)).toThrow(/overlaps/);
    expect(() => planMounts("/easel", vol, env)).toThrow(/overlaps/);
    expect(() => planMounts("node_modules/*", vol, env)).toThrow(/globs/);
  });
});

describe("keys and paths", () => {
  it("takes keys that are safe in a path", () => {
    for (const k of ["rust", "node-20", "a.b_c"]) expect(isKey(k)).toBe(true);
    for (const k of ["", ".", "..", "../up", "-x", "a/b", "x".repeat(65)]) expect(isKey(k)).toBe(false);
  });
  it("is true for the directory and below, not for a sibling with the same prefix", () => {
    expect(isWithin("/home/u/.cargo/registry", "/home/u")).toBe(true);
    expect(isWithin("/home/u", "/home/u/")).toBe(true);
    expect(isWithin("/home/user2/x", "/home/u")).toBe(false);
  });
});
