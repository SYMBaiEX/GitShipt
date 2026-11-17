import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("live fee configuration checkpoint", () => {
  for (const path of [
    "app/(public)/launch/actions.ts",
    "app/api/projects/[id]/launch/route.ts",
  ]) {
    it(`${path} checkpoints the mint and manifest before broadcasting`, () => {
      const source = readFileSync(path, "utf8");
      const checkpoint = source.indexOf("const [checkpoint]");
      const manifest = source.indexOf("await recordLaunch({", checkpoint);
      const broadcast = source.indexOf("await bags.createFeeShareConfig({", checkpoint);
      expect(checkpoint).toBeGreaterThan(-1);
      expect(manifest).toBeGreaterThan(checkpoint);
      expect(broadcast).toBeGreaterThan(manifest);
      expect(source.slice(checkpoint, broadcast)).toContain("bagsConfigKey: null");
      expect(source.slice(checkpoint, broadcast)).toContain("isInitFinalized: false");
    });

    it(`${path} checks the setup wallet before creating Bags metadata`, () => {
      const source = readFileSync(path, "utf8");
      const payerCheck = source.indexOf("await assertLaunchPayerFunded(");
      const metadata = source.indexOf("await bags.createTokenInfo({");
      expect(payerCheck).toBeGreaterThan(-1);
      expect(metadata).toBeGreaterThan(payerCheck);
    });
  }
});
