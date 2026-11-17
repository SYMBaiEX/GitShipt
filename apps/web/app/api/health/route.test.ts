import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ signer: vi.fn(), partner: "", treasury: "" }));
vi.mock("@/lib/redis", () => ({ redis: () => ({ ping: async () => "PONG" }) }));
vi.mock("@/db", () => ({ dbHttp: { execute: async () => undefined } }));
vi.mock("@/lib/env", () => ({
  hasCredentials: { ...Object.fromEntries(["bags", "bagsPartner", "github", "githubApp", "solana", "payoutKey", "heliusWebhook", "cron", "db"].map((key) => [key, () => true])), managerKey: () => false },
  productionReadiness: () => ({ ok: true, mode: "production" }),
  serverEnv: () => ({ BAGS_PARTNER_WALLET: mocks.partner, SOLANA_TREASURY_ADDRESS: mocks.treasury }),
}));
vi.mock("@/lib/solana/signer", () => ({ payoutSignerPublicKey: mocks.signer }));

describe("owner launch readiness", () => {
  it("allows missing manager when payer and partner match", async () => {
    const payer = Keypair.generate().publicKey.toBase58();
    mocks.partner = payer;
    mocks.treasury = Keypair.generate().publicKey.toBase58();
    mocks.signer.mockReturnValue(payer);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test/api/health?strict=1"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status.managerKey).toBe("optional");
    expect(body.payoutPublicKey).toBe(payer);
    expect(body.partnerClaimMode).toBe("automatic");
  });
  it("reports manual partner claims for a different payer and fails invalid keys without exposing errors", async () => {
    mocks.partner = Keypair.generate().publicKey.toBase58();
    mocks.treasury = Keypair.generate().publicKey.toBase58();
    mocks.signer.mockReturnValue(Keypair.generate().publicKey.toBase58());
    const { GET } = await import("./route");
    let response = await GET(new Request("https://example.test/api/health?strict=1"));
    expect(response.status).toBe(200);
    expect((await response.json()).partnerClaimMode).toBe("manual");
    mocks.signer.mockImplementation(() => { throw new Error("secret marker"); });
    response = await GET(new Request("https://example.test/api/health?strict=1"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret marker");
  });
  it("rejects an invalid treasury address", async () => {
    const payer = Keypair.generate().publicKey.toBase58();
    mocks.partner = payer;
    mocks.treasury = "invalid";
    mocks.signer.mockReturnValue(payer);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://example.test/api/health?strict=1"));
    expect(response.status).toBe(503);
    expect((await response.json()).status.treasuryWallet).toBe("fail");
  });
});
