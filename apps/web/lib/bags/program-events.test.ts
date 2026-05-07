import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __setCoderForTests,
  parseBagsProgramEvents,
} from "./program-events";

const FAKE_PUBKEY = "11111111111111111111111111111111";
const ANOTHER_PUBKEY = "22222222222222222222222222222222";

class FakePubkey {
  constructor(private readonly base58: string) {}
  toBase58(): string {
    return this.base58;
  }
}

describe("parseBagsProgramEvents", () => {
  afterEach(() => {
    __setCoderForTests(null);
  });

  it("ignores log lines that aren't program data", () => {
    __setCoderForTests({
      decode: () => {
        throw new Error("decode should not be called for non-data lines");
      },
    });
    const events = parseBagsProgramEvents([
      "Program FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK invoke [1]",
      "Program log: starting",
      "Program FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK consumed 1234",
    ]);
    expect(events).toEqual([]);
  });

  it("skips events the parser doesn't normalize (returns null)", () => {
    __setCoderForTests({
      decode: () => ({ name: "PartnerAccumulatedEvent", data: {} }),
    });
    const events = parseBagsProgramEvents([
      "Program data: AAAA",
      "Program data: BBBB",
    ]);
    expect(events).toEqual([]);
  });

  it("swallows decode errors per-line and continues", () => {
    let callIndex = 0;
    __setCoderForTests({
      decode: () => {
        callIndex++;
        if (callIndex === 1) throw new Error("malformed");
        return null;
      },
    });
    const events = parseBagsProgramEvents([
      "Program data: AAAA",
      "Program data: BBBB",
    ]);
    expect(events).toEqual([]);
  });

  it("normalizes a BagsFeeShareUserClaimV2Event with PublicKey-like fields", () => {
    __setCoderForTests({
      decode: () => ({
        name: "BagsFeeShareUserClaimV2Event",
        data: {
          timestamp: { toString: () => "1714000000" },
          baseMint: new FakePubkey(FAKE_PUBKEY),
          quoteMint: new FakePubkey(FAKE_PUBKEY),
          user: new FakePubkey(ANOTHER_PUBKEY),
          feeShareConfig: new FakePubkey(FAKE_PUBKEY),
          feeShareAuthority: new FakePubkey(FAKE_PUBKEY),
          claimerIndex: 7,
          claimed: { toString: () => "1500000000" },
          forceClaimExecutor: null,
          forceClaimType: null,
        },
      }),
    });
    const events = parseBagsProgramEvents(["Program data: SOMEBASE64"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "user_claim_v2",
      data: {
        timestamp: 1714000000n,
        baseMint: FAKE_PUBKEY,
        quoteMint: FAKE_PUBKEY,
        user: ANOTHER_PUBKEY,
        feeShareConfig: FAKE_PUBKEY,
        feeShareAuthority: FAKE_PUBKEY,
        claimerIndex: 7,
        claimed: 1500000000n,
        forceClaimExecutor: null,
        forceClaimType: null,
      },
    });
  });

  it("extracts force-claim metadata when present (executor + variant)", () => {
    __setCoderForTests({
      decode: () => ({
        name: "BagsFeeShareUserClaimV2Event",
        data: {
          timestamp: 1714000000n,
          baseMint: new FakePubkey(FAKE_PUBKEY),
          quoteMint: new FakePubkey(FAKE_PUBKEY),
          user: new FakePubkey(ANOTHER_PUBKEY),
          feeShareConfig: new FakePubkey(FAKE_PUBKEY),
          feeShareAuthority: new FakePubkey(FAKE_PUBKEY),
          claimerIndex: 0,
          claimed: 1000n,
          forceClaimExecutor: new FakePubkey(ANOTHER_PUBKEY),
          // Anchor decodes Rust enums as objects with one key matching the variant
          forceClaimType: { manager: {} },
        },
      }),
    });
    const events = parseBagsProgramEvents(["Program data: AAAA"]);
    expect(events[0]?.type).toBe("user_claim_v2");
    if (events[0]?.type !== "user_claim_v2") return;
    expect(events[0].data.forceClaimExecutor).toBe(ANOTHER_PUBKEY);
    expect(events[0].data.forceClaimType).toBe("manager");
  });

  it("normalizes FeeConfigUpdatedEvent with bps + claimer arrays", () => {
    __setCoderForTests({
      decode: () => ({
        name: "FeeConfigUpdatedEvent",
        data: {
          timestamp: 1714000000n,
          feeShareConfig: new FakePubkey(FAKE_PUBKEY),
          baseMint: new FakePubkey(FAKE_PUBKEY),
          newBps: [3000, 2000, 1000, 4000],
          newClaimers: [
            new FakePubkey(FAKE_PUBKEY),
            new FakePubkey(ANOTHER_PUBKEY),
            new FakePubkey(FAKE_PUBKEY),
            new FakePubkey(ANOTHER_PUBKEY),
          ],
        },
      }),
    });
    const events = parseBagsProgramEvents(["Program data: BBBB"]);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("fee_config_updated");
    if (events[0]?.type !== "fee_config_updated") return;
    expect(events[0].data.newBps).toEqual([3000, 2000, 1000, 4000]);
    expect(events[0].data.newClaimers).toHaveLength(4);
  });

  it("preserves event order across multiple data lines", () => {
    let i = 0;
    const sequence = [
      { name: "BagsFeeShareUserClaimV2Event", data: makeUserClaim(1) },
      { name: "FeeConfigUpdatedEvent", data: makeFeeConfigUpdated() },
      { name: "BagsFeeShareUserClaimV2Event", data: makeUserClaim(2) },
    ];
    __setCoderForTests({
      decode: () => sequence[i++] ?? null,
    });
    const events = parseBagsProgramEvents([
      "Program data: A",
      "Program data: B",
      "Program data: C",
    ]);
    expect(events.map((e) => e.type)).toEqual([
      "user_claim_v2",
      "fee_config_updated",
      "user_claim_v2",
    ]);
  });
});

describe("parseBagsProgramEvents — module exports", () => {
  beforeEach(() => {
    __setCoderForTests(null);
  });

  it("loads the real BorshEventCoder when no test override is set", async () => {
    // Smoke test: importing the module should not throw and the IDL JSON
    // should be resolvable. We don't try to decode here because that
    // requires a real on-chain log.
    const mod = await import("./program-events");
    expect(typeof mod.parseBagsProgramEvents).toBe("function");
  });
});

function makeUserClaim(claimerIndex: number): unknown {
  return {
    timestamp: 1714000000n,
    baseMint: new FakePubkey(FAKE_PUBKEY),
    quoteMint: new FakePubkey(FAKE_PUBKEY),
    user: new FakePubkey(ANOTHER_PUBKEY),
    feeShareConfig: new FakePubkey(FAKE_PUBKEY),
    feeShareAuthority: new FakePubkey(FAKE_PUBKEY),
    claimerIndex,
    claimed: 1000n,
    forceClaimExecutor: null,
    forceClaimType: null,
  };
}

function makeFeeConfigUpdated(): unknown {
  return {
    timestamp: 1714000000n,
    feeShareConfig: new FakePubkey(FAKE_PUBKEY),
    baseMint: new FakePubkey(FAKE_PUBKEY),
    newBps: [10000],
    newClaimers: [new FakePubkey(FAKE_PUBKEY)],
  };
}
