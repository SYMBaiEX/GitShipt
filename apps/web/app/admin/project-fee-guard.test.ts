import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project fee update guard", () => {
  it("does not expose a project fee override", () => {
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    expect(source).not.toContain("updateProjectPlatformFeeBps");
  });

  it("checks reward mode in the payout update itself before auditing success", () => {
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    const action = source.split("export async function updatePayoutConfig")[1]
      ?.split("// Audit CSV export")[0];
    expect(action).toMatch(/\.update\(projects\)[\s\S]*?COALESCE\(\$\{projects\.payoutConfig\}->>'rewardMode', 'contributors'\)[\s\S]*?rewardModeOf\(parsed\.payoutConfig\)[\s\S]*?\.returning\(/);
    expect(action).toMatch(/if \(!updated\) throw new Error\("project_not_found_or_reward_mode_immutable"\)[\s\S]*?await audit\(/);
  });
});
