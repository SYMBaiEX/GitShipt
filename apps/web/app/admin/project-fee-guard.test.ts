import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project fee update guard", () => {
  it("does not expose a project fee override", () => {
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    expect(source).not.toContain("updateProjectPlatformFeeBps");
  });
});
