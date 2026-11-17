import { describe, expect, it } from "vitest";
import { PlatformFeeBpsSchema } from "./platform-fee-schema";

describe("platform fee BPS", () => {
  it("accepts the full integer allocation range", () => {
    for (const value of [0, 1000, 10_000]) {
      expect(PlatformFeeBpsSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects fractions, out-of-range values and strings", () => {
    for (const value of [-1, 10_001, 1.5, "1000", NaN]) {
      expect(PlatformFeeBpsSchema.safeParse(value).success).toBe(false);
    }
  });
});
