"use strict";

// Pure-JS implementation of bigint-buffer's public conversion API. Never load
// its vulnerable native binding (GHSA-3gc7-fjrx-p6mg).
function toBigIntBE(buffer) {
  const hex = buffer.toString("hex");
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}

function toBigIntLE(buffer) {
  return toBigIntBE(Buffer.from(buffer).reverse());
}

function toBufferBE(number, width) {
  const hex = number.toString(16);
  return Buffer.from(hex.padStart(width * 2, "0").slice(0, width * 2), "hex");
}

function toBufferLE(number, width) {
  return toBufferBE(number, width).reverse();
}

module.exports = { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE };
