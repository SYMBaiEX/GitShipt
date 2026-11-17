import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  toBigIntBE,
  toBigIntLE,
  toBufferBE,
  toBufferLE,
} from "@repo/bigint-buffer";

describe("pure JavaScript bigint-buffer compatibility", () => {
  it("is the implementation resolved by Solana's buffer layouts", () => {
    const require = createRequire(import.meta.url);
    const fromBags = createRequire(require.resolve("@bagsfm/bags-sdk"));
    const fromToken = createRequire(fromBags.resolve("@solana/spl-token"));
    const fromLayout = createRequire(
      fromToken.resolve("@solana/buffer-layout-utils"),
    );
    expect(fromLayout("bigint-buffer").toBigIntLE.toString()).toBe(
      toBigIntLE.toString(),
    );
  });

  it("converts both byte orders without mutating the input", () => {
    const bytes = Buffer.from([1, 2, 3]);
    expect(toBigIntBE(bytes)).toBe(0x010203n);
    expect(toBigIntLE(bytes)).toBe(0x030201n);
    expect(bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(toBigIntLE(Buffer.alloc(0))).toBe(0n);
  });

  it("round-trips u64 values through the SDK's Solana layouts", () => {
    const require = createRequire(import.meta.url);
    const fromBags = createRequire(require.resolve("@bagsfm/bags-sdk"));
    const fromToken = createRequire(fromBags.resolve("@solana/spl-token"));
    const layouts = fromToken("@solana/buffer-layout-utils") as {
      u64: () => {
        encode: (value: bigint, bytes: Uint8Array, offset: number) => number;
        decode: (bytes: Uint8Array, offset: number) => bigint;
      };
      u64be: () => {
        encode: (value: bigint, bytes: Uint8Array, offset: number) => number;
        decode: (bytes: Uint8Array, offset: number) => bigint;
      };
    };
    for (const [factory, expected] of [
      [layouts.u64, [0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]],
      [layouts.u64be, [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]],
    ] as const) {
      const layout = factory();
      const bytes = Buffer.alloc(8);
      expect(layout.encode(0x0102030405060708n, bytes, 0)).toBe(8);
      expect(bytes).toEqual(Buffer.from(expected));
      expect(layout.decode(bytes, 0)).toBe(0x0102030405060708n);
    }
  });

  it("preserves upstream padding and truncation semantics", () => {
    expect(toBufferBE(0x1234n, 4)).toEqual(Buffer.from([0, 0, 0x12, 0x34]));
    expect(toBufferLE(0x1234n, 4)).toEqual(Buffer.from([0x34, 0x12, 0, 0]));
    expect(toBufferBE(0x123456n, 2)).toEqual(Buffer.from([0x12, 0x34]));
    expect(toBufferLE(0x123456n, 2)).toEqual(Buffer.from([0x34, 0x12]));
    expect(toBufferBE(0n, 0)).toEqual(Buffer.alloc(0));
  });

  it("handles buffers larger than the native binding's stack allocation", () => {
    const bytes = Buffer.alloc(4096, 0xff);
    expect(toBigIntBE(bytes)).toBe(toBigIntLE(bytes));
    expect(toBufferBE(toBigIntBE(bytes), bytes.length)).toEqual(bytes);
  });
});
