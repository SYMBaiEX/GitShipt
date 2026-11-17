import { describe, expect, it } from "vitest";
import { selectOwnerAccount } from "./owner-bootstrap";

describe("owner bootstrap identity", () => {
  const owner = { id: "owner", role: "user", providerId: "github", accountId: "192078165" };

  it("accepts only the verified GitHub provider account", () => {
    expect(selectOwnerAccount([owner])).toMatchObject({ id: "owner" });
    expect(() => selectOwnerAccount([{ ...owner, providerId: "other" }])).toThrow();
    expect(() => selectOwnerAccount([{ ...owner, accountId: "SYMBaiEX" }])).toThrow();
    expect(() => selectOwnerAccount([{ ...owner, accountId: "123" }])).toThrow();
  });

  it("rejects missing or ambiguous links", () => {
    expect(() => selectOwnerAccount([])).toThrow();
    expect(() => selectOwnerAccount([owner, { ...owner, id: "other" }])).toThrow();
  });
});
